import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Sparkles } from 'lucide-react'
import type { ForecastPoint, HistoricalPoint } from '../types'
import { formatCompact, formatDate, formatNumber } from '../utils/format'

interface ForecastChartProps {
  historical: HistoricalPoint[]
  forecast: ForecastPoint[]
  modelLabel: string
  area: string
  wasteType: string
}

interface MergedPoint {
  date: string
  label: string
  historical: number | null
  forecast: number | null
  tons: number | null
}

function TooltipCard({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: MergedPoint }>
}) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  const isForecast = point.forecast !== null && point.historical === null
  const value = isForecast ? point.forecast : point.historical
  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-900/95 px-3.5 py-2.5 shadow-2xl backdrop-blur-xl">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {formatDate(point.date)}
      </p>
      <p className="mt-1 flex items-baseline gap-1.5">
        <span className="font-mono text-lg font-bold text-white">
          {formatNumber(value, 1)}
        </span>
        <span className="text-xs text-slate-400">m³</span>
      </p>
      {point.tons !== null && (
        <p className="mt-0.5 text-[11px] text-slate-500">
          ≈ {formatNumber(point.tons, 2)} tons
        </p>
      )}
      <p
        className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
          isForecast
            ? 'bg-emerald-500/15 text-emerald-300'
            : 'bg-cyan-500/15 text-cyan-300'
        }`}
      >
        {isForecast ? 'Forecast' : 'Actual'}
      </p>
    </div>
  )
}

export default function ForecastChart({
  historical,
  forecast,
  modelLabel,
  area,
  wasteType,
}: ForecastChartProps) {
  const merged: MergedPoint[] = historical.map((h) => ({
    date: h.date,
    label: formatDate(h.date),
    historical: h.volume,
    forecast: null,
    tons: h.tons,
  }))

  // Bridge the last actual point into the forecast series so the lines connect seamlessly.
  if (merged.length && forecast.length) {
    const last = merged[merged.length - 1]
    last.forecast = last.historical
  }

  forecast.forEach((f) => {
    merged.push({
      date: f.date,
      label: formatDate(f.date),
      historical: null,
      forecast: f.volume,
      tons: f.tons,
    })
  })

  const boundary = forecast.length ? formatDate(forecast[0].date) : undefined

  const forecastTotal = forecast.reduce((sum, f) => sum + f.volume, 0)
  const forecastAvg = forecast.length ? forecastTotal / forecast.length : 0
  const forecastPeak = forecast.length ? Math.max(...forecast.map((f) => f.volume)) : 0

  const stats = [
    { label: 'Forecast total', value: `${formatCompact(forecastTotal)} m³`, tone: 'text-emerald-300' },
    { label: 'Avg / day', value: `${formatNumber(forecastAvg, 1)} m³`, tone: 'text-cyan-300' },
    { label: 'Peak day', value: `${formatNumber(forecastPeak, 1)} m³`, tone: 'text-amber-300' },
  ]

  return (
    <section className="glass animate-fade-up p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="kicker">
            <Sparkles size={13} className="text-emerald-400" />
            Forecast Engine
          </span>
          <h2 className="mt-1.5 text-base font-semibold text-white">Waste Volume Forecast</h2>
          <p className="mt-1 text-xs text-slate-500">
            {area} · {wasteType} · generated with{' '}
            <span className="font-medium text-slate-300">{modelLabel}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <span className="flex items-center gap-2 text-slate-400">
            <span className="h-1 w-5 rounded-full bg-cyan-400 shadow-glow-cyan" />
            Historical
          </span>
          <span className="flex items-center gap-2 text-slate-400">
            <span className="h-1 w-5 rounded-full border-t-2 border-dashed border-emerald-400" />
            Forecast
          </span>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="glass-soft px-3 py-2.5"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {stat.label}
            </p>
            <p className={`mt-1 font-mono text-sm font-bold tabular ${stat.tone}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="h-[360px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={merged} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="forecastGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10B981" stopOpacity={0.42} />
                <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="historyGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#06B6D4" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#06B6D4" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: '#64748b', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: '#1e293b' }}
              minTickGap={42}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: '#64748b', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={54}
              label={{
                value: 'Volume (m³)',
                angle: -90,
                position: 'insideLeft',
                style: { fill: '#475569', fontSize: 11 },
              }}
            />

            <Tooltip content={<TooltipCard />} cursor={{ stroke: '#334155', strokeWidth: 1 }} />

            <Area
              type="monotone"
              dataKey="historical"
              stroke="#06B6D4"
              strokeWidth={2.5}
              fill="url(#historyGradient)"
              dot={false}
              activeDot={{ r: 4, fill: '#06B6D4', stroke: '#0f172a', strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive
            />
            <Area
              type="monotone"
              dataKey="forecast"
              stroke="#10B981"
              strokeWidth={2.5}
              strokeDasharray="6 4"
              fill="url(#forecastGradient)"
              dot={false}
              activeDot={{ r: 4, fill: '#10B981', stroke: '#0f172a', strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive
            />
            <Line
              type="monotone"
              dataKey="forecast"
              stroke="#10B981"
              strokeWidth={2.5}
              strokeDasharray="6 4"
              dot={false}
              legendType="none"
              connectNulls={false}
            />

            {boundary && (
              <ReferenceLine
                x={boundary}
                stroke="#475569"
                strokeDasharray="4 4"
                label={{
                  value: 'Forecast start',
                  position: 'insideTopRight',
                  style: { fill: '#64748b', fontSize: 10 },
                }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
