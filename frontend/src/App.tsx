import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Leaf, Loader2, Play, RefreshCw, ShieldAlert, Sparkles } from 'lucide-react'
import { extractErrorMessage, getFilters, getForecast } from './api/client'
import type { FiltersResponse, ForecastResponse, UploadResponse } from './types'
import AuroraBackground from './components/AuroraBackground'
import Navbar from './components/Navbar'
import ControlBar, { type Selection } from './components/ControlBar'
import KpiCards from './components/KpiCards'
import ForecastChart from './components/ForecastChart'
import BreakdownChart from './components/BreakdownChart'
import ScheduleTable from './components/ScheduleTable'
import UploadModal from './components/UploadModal'
import InfoModal from './components/InfoModal'
import { ChartSkeleton, KpiCardsSkeleton, TableSkeleton } from './components/Skeletons'

/** Shown before the first run so no predictions appear until the user submits. */
function RunPrompt({ onRun, loading }: { onRun: () => void; loading: boolean }) {
  return (
    <div className="glass animate-fade-up relative overflow-hidden p-10 text-center">
      <div className="pointer-events-none absolute left-1/2 top-0 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/20 blur-3xl" />
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500/25 to-cyan-500/10 text-emerald-300">
        <Sparkles size={24} />
      </span>
      <h2 className="mt-4 text-lg font-semibold text-white">No forecast yet</h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-500">
        Pick a zone, waste type, model and horizon above, then run the forecast to see predictions,
        composition and the collection schedule.
      </p>
      <button
        type="button"
        onClick={onRun}
        disabled={loading}
        className="btn-primary focus-ring mx-auto mt-5 flex items-center gap-2 px-5 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
      >
        <Play size={15} strokeWidth={2.6} />
        Run Forecast
      </button>
    </div>
  )
}

export default function App() {
  const [filters, setFilters] = useState<FiltersResponse | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [debounced, setDebounced] = useState<Selection | null>(null)
  const [data, setData] = useState<ForecastResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [bootError, setBootError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [hasRun, setHasRun] = useState(false)

  // ---- initial boot: filters ------------------------------------------
  const loadFilters = useCallback(async (): Promise<FiltersResponse | null> => {
    try {
      const f = await getFilters()
      setFilters(f)
      setBootError(null)
      setSelection((prev) =>
        prev ?? {
          area: f.areas[0],
          wasteType: f.waste_types[0],
          model: 'random_forest',
          days: f.horizon.default,
        },
      )
      return f
    } catch (err) {
      setBootError(extractErrorMessage(err))
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadFilters()
  }, [loadFilters])

  // ---- debounce selection changes (esp. the horizon slider) ------------
  // Guarded by `hasRun`: nothing is fetched until the user submits a forecast,
  // so predictions stay hidden before any data is actually requested.
  useEffect(() => {
    if (!hasRun || !selection) return
    const timer = setTimeout(() => setDebounced(selection), 280)
    return () => clearTimeout(timer)
  }, [selection, hasRun])

  // ---- fetch forecast on (debounced) selection change ------------------
  useEffect(() => {
    if (!debounced) return
    let cancelled = false
    setLoading(true)
    setError(null)
    getForecast({
      area: debounced.area,
      waste_type: debounced.wasteType,
      model: debounced.model,
      days: debounced.days,
    })
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch((err) => {
        if (!cancelled) setError(extractErrorMessage(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [debounced])

  const handleChange = useCallback((next: Partial<Selection>) => {
    setSelection((prev) => (prev ? { ...prev, ...next } : prev))
  }, [])

  // Explicit submit: reveals the results and kicks off the first forecast.
  const handleRun = useCallback(() => {
    setHasRun(true)
    setSelection((prev) => (prev ? { ...prev } : prev))
  }, [])

  const handleRefresh = useCallback(async () => {
    setLoading(true)
    await loadFilters()
    if (hasRun) setDebounced((prev) => (prev ? { ...prev } : prev))
    setLoading(false)
  }, [loadFilters, hasRun])

  const handleUploaded = useCallback(
    async (_result: UploadResponse) => {
      // A new dataset invalidates the current forecast — hide it and reset.
      setData(null)
      setHasRun(false)
      setDebounced(null)
      setSelection(null)
      await loadFilters()
    },
    [loadFilters],
  )

  const modelLabel = useMemo(() => {
    if (!filters || !selection) return '—'
    return filters.models.find((m) => m.value === selection.model)?.label ?? selection.model
  }, [filters, selection])

  const refreshing = loading && !!data

  return (
    <div className="min-h-screen">
      <AuroraBackground />

      <Navbar
        dataset={filters?.dataset ?? null}
        trainingInProgress={false}
        onUploadClick={() => setUploadOpen(true)}
        onInfoClick={() => setInfoOpen(true)}
        onRefresh={handleRefresh}
        refreshing={refreshing}
      />

      <main className="mx-auto max-w-[1600px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        {bootError && (
          <div className="glass animate-fade-up relative flex items-start gap-4 overflow-hidden p-5">
            <div className="pointer-events-none absolute -left-16 -top-16 h-40 w-40 rounded-full bg-rose-500/25 blur-3xl" />
            <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-rose-500/25 to-rose-500/5 text-rose-300">
              <AlertCircle size={19} />
            </span>
            <div className="flex-1">
              <p className="font-semibold text-rose-200">Backend unavailable</p>
              <p className="mt-1 text-sm text-slate-400">{bootError}</p>
              <p className="mt-2 text-xs text-slate-500">
                Start it with:{' '}
                <code className="rounded bg-slate-800/80 px-1.5 py-0.5 font-mono text-emerald-300">
                  uvicorn main:app --reload --port 8000
                </code>{' '}
                inside the <span className="text-slate-300">/backend</span> folder.
              </p>
              <button
                type="button"
                onClick={handleRefresh}
                className="btn-primary focus-ring mt-3 flex items-center gap-2 px-3.5 py-2 text-sm"
              >
                <RefreshCw size={14} /> Retry connection
              </button>
            </div>
          </div>
        )}

        {filters && selection && (
          <ControlBar
            filters={filters}
            selection={selection}
            onChange={handleChange}
            onRun={handleRun}
            loading={loading}
          />
        )}

        {error && (
          <div className="glass animate-fade-up flex items-center gap-3 border-amber-500/30 px-5 py-4">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-500/15 text-amber-300">
              <AlertCircle size={16} />
            </span>
            <p className="text-sm text-amber-200">{error}</p>
          </div>
        )}

        {((!filters && loading) || (hasRun && loading && !data)) && (
          <div className="space-y-5">
            <KpiCardsSkeleton />
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
              <div className="xl:col-span-2">
                <ChartSkeleton />
              </div>
              <ChartSkeleton height={360} />
            </div>
            <TableSkeleton />
          </div>
        )}

        {!hasRun && !data && filters && selection && !loading && !bootError && (
          <RunPrompt onRun={handleRun} loading={loading} />
        )}

        {data && (
          <div className={`space-y-5 transition-opacity duration-300 ${refreshing ? 'opacity-60' : 'opacity-100'}`}>
            {!data.meta.model_ready && (
              <div className="flex items-center gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] px-5 py-3 text-sm text-amber-200 backdrop-blur-xl">
                <ShieldAlert size={17} className="shrink-0 text-amber-300" />
                The selected model is still training for this combination — a seasonal-naive
                baseline forecast is shown meanwhile.
              </div>
            )}

            <KpiCards data={data} />

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
              <div className="xl:col-span-2">
                <ForecastChart
                  historical={data.historical}
                  forecast={data.forecast}
                  modelLabel={modelLabel}
                  area={data.meta.area}
                  wasteType={data.meta.waste_type}
                />
              </div>
              <BreakdownChart breakdown={data.breakdown} area={data.meta.area} />
            </div>

            <ScheduleTable rows={data.schedule} recommendations={data.recommendations} />
          </div>
        )}
      </main>

      <footer className="mx-auto max-w-[1600px] px-4 pb-8 pt-2 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/70 pt-5 text-xs text-slate-600">
          <span className="flex items-center gap-2">
            <span className="grid h-5 w-5 place-items-center rounded-md bg-gradient-to-br from-emerald-500/25 to-cyan-500/10">
              <Leaf size={12} className="text-emerald-400" />
            </span>
            <span className="font-medium text-slate-500">
              EcoPulse<span className="text-slate-600"> AI</span> · Waste Generation Forecasting
              Dashboard
            </span>
          </span>
          <span className="max-w-xl text-slate-600">
            Forecasts are model-generated estimates from historical collection records and are
            indicative only.
          </span>
        </div>
      </footer>

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={handleUploaded}
      />

      <InfoModal open={infoOpen} onClose={() => setInfoOpen(false)} filters={filters} />

      {refreshing && (
        <div className="pointer-events-none fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full border border-emerald-500/25 bg-slate-900/80 px-4 py-2 text-xs font-medium text-slate-200 shadow-glow-soft backdrop-blur-xl">
          <Loader2 size={14} className="animate-spin text-emerald-400" />
          Updating forecast…
        </div>
      )}
    </div>
  )
}
