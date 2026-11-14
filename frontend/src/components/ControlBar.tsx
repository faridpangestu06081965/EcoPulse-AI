import { CalendarRange, Cpu, Layers, MapPin, Play, Recycle, SlidersHorizontal } from 'lucide-react'
import Dropdown, { type DropdownOption } from './Dropdown'
import type { FiltersResponse, ModelKey } from '../types'

export interface Selection {
  area: string
  wasteType: string
  model: ModelKey
  days: number
}

interface ControlBarProps {
  filters: FiltersResponse
  selection: Selection
  onChange: (next: Partial<Selection>) => void
  onRun: () => void
  loading: boolean
}

export default function ControlBar({
  filters,
  selection,
  onChange,
  onRun,
  loading,
}: ControlBarProps) {
  const areaOptions: DropdownOption[] = filters.areas.map((a) => ({ value: a, label: a }))
  const typeOptions: DropdownOption[] = filters.waste_types.map((t) => ({ value: t, label: t }))
  const modelOptions: DropdownOption[] = filters.models.map((m) => ({
    value: m.value,
    label: m.label,
  }))

  const min = filters.horizon.min
  const max = filters.horizon.max
  const progress = ((selection.days - min) / (max - min)) * 100
  const ticks = Array.from({ length: 7 }, (_, i) => min + ((max - min) / 6) * i)

  return (
    <section className="glass animate-fade-up relative z-20 p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="kicker">
          <SlidersHorizontal size={13} className="text-emerald-400" />
          Forecast Controls
        </span>
        <div className="flex items-center gap-2.5">
          <span className="chip border-emerald-500/25 bg-emerald-500/10 text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {selection.days}d horizon
          </span>
          <button
            type="button"
            onClick={onRun}
            disabled={loading}
            className="btn-primary focus-ring flex items-center gap-2 px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
          >
            <Play size={15} strokeWidth={2.6} />
            Run Forecast
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1.35fr]">
        <Dropdown
          label="Location / Area"
          icon={<MapPin size={15} />}
          value={selection.area}
          options={areaOptions}
          onChange={(v) => onChange({ area: v })}
          disabled={loading}
        />
        <Dropdown
          label="Waste Type"
          icon={<Recycle size={15} />}
          value={selection.wasteType}
          options={typeOptions}
          onChange={(v) => onChange({ wasteType: v })}
          disabled={loading}
        />
        <Dropdown
          label="Predictive Model"
          icon={<Cpu size={15} />}
          value={selection.model}
          options={modelOptions}
          onChange={(v) => onChange({ model: v as ModelKey })}
          disabled={loading}
        />

        {/* Forecast horizon slider */}
        <div className="flex flex-col">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="kicker">
              <CalendarRange size={13} /> Forecast Horizon
            </span>
            <span className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-xs font-semibold text-emerald-300 tabular">
              {selection.days} days
            </span>
          </div>
          <div className="flex h-[42px] items-center rounded-xl border border-slate-800/80 bg-slate-950/50 px-4">
            <input
              type="range"
              className="eco-range"
              min={min}
              max={max}
              step={1}
              value={selection.days}
              disabled={loading}
              onChange={(e) => onChange({ days: Number(e.target.value) })}
              style={{ '--range-progress': `${progress}%` } as React.CSSProperties}
              aria-label="Forecast horizon in days"
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between px-0.5">
            {ticks.map((t) => (
              <span
                key={t}
                className={`h-1 w-1 rounded-full ${
                  t <= selection.days ? 'bg-emerald-400/80' : 'bg-slate-700'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-800/60 pt-3.5 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <Layers size={12} className="text-emerald-500" />
          {filters.dataset?.areas.length ?? 0} zones · {filters.dataset?.waste_types.length ?? 0} waste
          streams
        </span>
        <span className="flex items-center gap-1.5">
          <Cpu size={12} className="text-cyan-500" />
          4 models · ARIMA · LSTM · Random Forest · XGBoost
        </span>
        <span className="flex items-center gap-1.5">
          <Recycle size={12} className="text-emerald-500" />
          Dataset window {filters.dataset?.total_days ?? 0} days
        </span>
      </div>
    </section>
  )
}
