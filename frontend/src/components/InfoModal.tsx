import { useEffect } from 'react'
import { Cpu, Database, Info, Layers, X } from 'lucide-react'
import type { FiltersResponse } from '../types'
import { formatCompact } from '../utils/format'

interface InfoModalProps {
  open: boolean
  onClose: () => void
  filters: FiltersResponse | null
}

const MODEL_INFO: Record<string, { tag: string; desc: string }> = {
  random_forest: {
    tag: 'Ensemble · bagged trees',
    desc: 'Robust to outliers and irregular seasonality; captures non-linear patterns from lag and calendar features.',
  },
  xgboost: {
    tag: 'Gradient boosting',
    desc: 'High accuracy through stage-wise boosting; fast and strong on tabular time-series with lag features.',
  },
  lstm: {
    tag: 'Deep learning · recurrent',
    desc: 'Learns long-range sequential dependencies from a 14-day lookback window.',
  },
  arima: {
    tag: 'Statistical · ARIMA / SARIMAX',
    desc: 'Classic seasonal model driven by trend and auto-correlation; an interpretable baseline.',
  },
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-slate-800/70 bg-slate-900/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-emerald-500/25 to-cyan-500/10 text-emerald-300">
          {icon}
        </span>
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>
      {children}
    </section>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800/60 bg-slate-950/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-0.5 truncate text-sm font-medium text-slate-200" title={value}>
        {value}
      </p>
    </div>
  )
}

function ChipGroup({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null
  return (
    <div className="mt-3">
      <p className="mb-1.5 text-[10px] uppercase tracking-wider text-slate-500">
        {label} ({items.length})
      </p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span key={item} className="chip">
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function InfoModal({ open, onClose, filters }: InfoModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const dataset = filters?.dataset ?? null
  const models = filters?.models ?? []

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm animate-fade-in"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="glass w-full max-w-2xl animate-fade-up p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-500/25 to-cyan-500/10 text-emerald-300">
              <Info size={18} />
            </span>
            <div>
              <h2 className="text-lg font-semibold leading-tight text-white">
                Data &amp; Model Information
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">What powers this forecast</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 max-h-[68vh] space-y-3 overflow-auto pr-1">
          <Section icon={<Database size={14} />} title="Data Source">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              <Field label="Active dataset" value={dataset?.name ?? '—'} />
              <Field label="Records" value={dataset ? formatCompact(dataset.rows) : '—'} />
              <Field
                label="Coverage"
                value={dataset ? `${dataset.start_date} → ${dataset.end_date}` : '—'}
              />
              <Field label="Window" value={dataset ? `${dataset.total_days} days` : '—'} />
              <Field
                label="Total volume"
                value={dataset ? `${formatCompact(dataset.total_volume_m3)} m³` : '—'}
              />
              <Field
                label="Total weight"
                value={dataset ? `${formatCompact(dataset.total_weight_tons)} tons` : '—'}
              />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              This is the CSV currently ingested by the backend and used to train every model.
              Column names are auto-detected on upload; replacing it via{' '}
              <span className="text-slate-300">Upload CSV</span> triggers a full retrain.
            </p>
          </Section>

          <Section icon={<Layers size={14} />} title="Data Type">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              <Field label="Domain" value="Municipal solid waste" />
              <Field label="Granularity" value="Daily · zone × type" />
              <Field label="Core fields" value="date, area, waste_type, volume, weight" />
            </div>
            <ChipGroup label="Zones" items={dataset?.areas ?? []} />
            <ChipGroup label="Waste streams" items={dataset?.waste_types ?? []} />
          </Section>

          <Section icon={<Cpu size={14} />} title="Models">
            <ul className="space-y-2">
              {models.map((model) => {
                const info = MODEL_INFO[model.value]
                return (
                  <li
                    key={model.value}
                    className="rounded-lg border border-slate-800/60 bg-slate-950/40 px-3 py-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-100">{model.label}</span>
                      {info && (
                        <span className="text-[10px] uppercase tracking-wider text-slate-500">
                          {info.tag}
                        </span>
                      )}
                    </div>
                    {info && (
                      <p className="mt-1 text-xs leading-relaxed text-slate-400">{info.desc}</p>
                    )}
                  </li>
                )
              })}
              {models.length === 0 && (
                <li className="py-4 text-center text-sm text-slate-500">
                  Model list unavailable — is the backend running?
                </li>
              )}
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              Each zone × waste-type series is trained and scored per model: the last 30 days are
              held out for evaluation (RMSE / MAE / R²), then forecasts run recursively over the
              selected 7–30 day horizon.
            </p>
          </Section>
        </div>

        <div className="mt-5 flex justify-end">
          <button type="button" onClick={onClose} className="btn-primary focus-ring px-5 py-2.5 text-sm">
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
