import { AlertTriangle, Gauge, PackageOpen, TrendingDown, TrendingUp, Truck } from 'lucide-react'
import type { ForecastResponse } from '../types'
import { formatDateLong, formatNumber, formatSigned } from '../utils/format'
import { useCountUp } from '../hooks/useCountUp'
import Sparkline from './Sparkline'
import RadialGauge from './RadialGauge'

interface KpiCardsProps {
  data: ForecastResponse
}

type Tone = 'emerald' | 'cyan' | 'amber' | 'violet'

const TONES: Record<Tone, { chip: string; glow: string }> = {
  emerald: {
    chip: 'from-emerald-500/25 to-emerald-500/5 text-emerald-300',
    glow: 'bg-emerald-500/25',
  },
  cyan: {
    chip: 'from-cyan-500/25 to-cyan-500/5 text-cyan-300',
    glow: 'bg-cyan-500/25',
  },
  amber: {
    chip: 'from-amber-500/25 to-amber-500/5 text-amber-300',
    glow: 'bg-amber-500/25',
  },
  violet: {
    chip: 'from-violet-500/25 to-violet-500/5 text-violet-300',
    glow: 'bg-violet-500/25',
  },
}

/** Animates a number toward its target using the shared count-up hook. */
function AnimatedNumber({
  value,
  digits = 1,
  className = '',
}: {
  value: number
  digits?: number
  className?: string
}) {
  const animated = useCountUp(value)
  return <span className={className}>{formatNumber(animated, digits)}</span>
}

function TrendBadge({ value }: { value: number }) {
  const positive = value >= 0
  const Icon = positive ? TrendingUp : TrendingDown
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${
        positive
          ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
          : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
      }`}
      title="Change vs. the previous equivalent period"
    >
      <Icon size={12} strokeWidth={2.6} />
      {formatSigned(value)}
    </span>
  )
}

function CardShell({
  label,
  icon,
  tone,
  children,
}: {
  label: string
  icon: React.ReactNode
  tone: Tone
  children: React.ReactNode
}) {
  const t = TONES[tone]
  return (
    <article className="glass glass-interactive animate-fade-up relative overflow-hidden p-5">
      <div
        className={`pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full ${t.glow} opacity-60 blur-3xl`}
      />
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          {label}
        </p>
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${t.chip}`}
        >
          {icon}
        </span>
      </div>
      <div className="mt-3">{children}</div>
    </article>
  )
}

export default function KpiCards({ data }: KpiCardsProps) {
  const { kpis, metrics, meta, forecast, schedule } = data
  const accuracy = metrics.accuracy_score ?? kpis.accuracy_score

  const volumeSpark = forecast.map((f) => f.volume)
  const truckSpark = (schedule.length ? schedule.map((r) => r.tons) : forecast.map((f) => f.tons))

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {/* 1 · Predicted total volume */}
      <CardShell label="Predicted Total Volume" icon={<PackageOpen size={17} />} tone="cyan">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-mono text-3xl font-bold leading-none tracking-tight text-white">
              <AnimatedNumber value={kpis.predicted_total_volume} />
              <span className="ml-1 text-sm font-medium text-slate-400">m³</span>
            </p>
            <p className="mt-2 text-xs text-slate-500">
              ≈ {formatNumber(kpis.predicted_total_tons, 1)} tons · {meta.days} days
            </p>
          </div>
          <TrendBadge value={kpis.trend_pct} />
        </div>
        {volumeSpark.length > 1 && (
          <div className="mt-3 -mb-1 opacity-90">
            <Sparkline data={volumeSpark} color="#06B6D4" />
          </div>
        )}
      </CardShell>

      {/* 2 · Truck allocation */}
      <CardShell label="Recommended Truck Allocation" icon={<Truck size={17} />} tone="emerald">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-mono text-3xl font-bold leading-none tracking-tight text-white">
              <AnimatedNumber value={kpis.trucks_required} digits={0} />
              <span className="ml-1 text-sm font-medium text-slate-400">trucks</span>
            </p>
            <p className="mt-2 text-xs text-slate-500">
              {meta.truck_capacity_tons} t payload · {formatNumber(kpis.trucks_per_day, 2)} trucks/day
              avg
            </p>
          </div>
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-300">
            {formatNumber(kpis.avg_daily_tons, 2)} t/day
          </span>
        </div>
        {truckSpark.length > 1 && (
          <div className="mt-3 -mb-1 opacity-90">
            <Sparkline data={truckSpark} color="#10B981" />
          </div>
        )}
      </CardShell>

      {/* 3 · Model accuracy */}
      <CardShell label="Model Accuracy Score" icon={<Gauge size={17} />} tone="violet">
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <RadialGauge value={accuracy ?? 0} size={86} strokeWidth={8} />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-mono text-sm font-bold text-white tabular">
                {accuracy !== null && accuracy !== undefined ? `${formatNumber(accuracy, 0)}%` : '—'}
              </span>
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">RMSE</span>
              <span className="font-mono font-semibold text-slate-200">
                {formatNumber(metrics.rmse, 3)}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">MAE</span>
              <span className="font-mono font-semibold text-slate-200">
                {formatNumber(metrics.mae, 3)}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">R²</span>
              <span className="font-mono font-semibold text-slate-200">
                {formatNumber(metrics.r2, 3)}
              </span>
            </div>
          </div>
        </div>
      </CardShell>

      {/* 4 · Peak waste day */}
      <CardShell label="Peak Waste Day" icon={<AlertTriangle size={17} />} tone="amber">
        <p className="text-2xl font-bold leading-tight tracking-tight text-white">
          {formatDateLong(kpis.peak_day.date)}
        </p>
        <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
          <span className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-2 py-1">
            <span className="font-mono font-semibold text-amber-300">
              {formatNumber(kpis.peak_day.volume, 1)}
            </span>{' '}
            m³
          </span>
          <span className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-2 py-1">
            <span className="font-mono font-semibold text-amber-300">
              {formatNumber(kpis.peak_day.tons, 2)}
            </span>{' '}
            tons
          </span>
        </div>
      </CardShell>
    </div>
  )
}
