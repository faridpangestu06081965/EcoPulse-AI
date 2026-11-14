import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { PieChart as PieIcon } from 'lucide-react'
import type { BreakdownItem } from '../types'
import { formatCompact, formatNumber } from '../utils/format'

interface BreakdownChartProps {
  breakdown: BreakdownItem[]
  area: string
}

const PALETTE = ['#06B6D4', '#10B981', '#22D3EE', '#34D399', '#0EA5E9', '#2DD4BF', '#38BDF8']

function DonutTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: BreakdownItem }>
}) {
  if (!active || !payload?.length) return null
  const item = payload[0].payload
  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-900/95 px-3 py-2 text-xs shadow-2xl backdrop-blur-xl">
      <p className="font-semibold text-white">{item.waste_type}</p>
      <p className="mt-0.5 text-slate-400">
        <span className="font-mono text-slate-200">{formatNumber(item.volume, 1)}</span> m³ ·{' '}
        {formatNumber(item.share, 1)}%
      </p>
    </div>
  )
}

export default function BreakdownChart({ breakdown, area }: BreakdownChartProps) {
  const total = breakdown.reduce((sum, b) => sum + b.volume, 0)
  const maxShare = Math.max(...breakdown.map((b) => b.share), 1)

  return (
    <section className="glass animate-fade-up p-5">
      <div className="mb-2 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-cyan-500/25 to-cyan-500/5 text-cyan-300">
          <PieIcon size={15} />
        </span>
        <div>
          <h2 className="text-base font-semibold leading-tight text-white">Waste Composition</h2>
          <p className="text-xs text-slate-500">By waste type · {area} · last 90 days</p>
        </div>
      </div>

      <div className="mt-4 flex flex-col items-center gap-5 lg:flex-row">
        <div className="relative h-[200px] w-[200px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={breakdown}
                dataKey="volume"
                nameKey="waste_type"
                innerRadius={60}
                outerRadius={92}
                paddingAngle={3}
                stroke="none"
                cornerRadius={4}
              >
                {breakdown.map((entry, index) => (
                  <Cell key={entry.waste_type} fill={PALETTE[index % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip content={<DonutTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-mono text-xl font-bold text-white">{formatCompact(total)}</span>
            <span className="text-[10px] uppercase tracking-wider text-slate-500">m³ total</span>
          </div>
        </div>

        <ul className="w-full space-y-1.5">
          {breakdown.map((item, index) => (
            <li
              key={item.waste_type}
              className="relative overflow-hidden rounded-lg border border-slate-800/60 px-3 py-2"
            >
              <span
                className="absolute inset-y-0 left-0 -z-0 rounded-r-lg opacity-20 transition-[width] duration-700 ease-out"
                style={{
                  width: `${(item.share / maxShare) * 100}%`,
                  background: PALETTE[index % PALETTE.length],
                }}
              />
              <div className="relative flex items-center gap-3">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: PALETTE[index % PALETTE.length] }}
                />
                <span className="flex-1 truncate text-sm text-slate-300">{item.waste_type}</span>
                <span className="font-mono text-xs text-slate-500">
                  {formatNumber(item.volume, 0)} m³
                </span>
                <span className="w-12 text-right font-mono text-xs font-semibold text-slate-100 tabular">
                  {formatNumber(item.share, 1)}%
                </span>
              </div>
            </li>
          ))}
          {breakdown.length === 0 && (
            <li className="py-6 text-center text-sm text-slate-500">No composition data available.</li>
          )}
        </ul>
      </div>
    </section>
  )
}
