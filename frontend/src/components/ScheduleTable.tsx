import { CalendarClock, Info, Truck } from 'lucide-react'
import type { Recommendations, ScheduleRow } from '../types'
import { formatDate, formatNumber } from '../utils/format'
import StatusBadge from './StatusBadge'

interface ScheduleTableProps {
  rows: ScheduleRow[]
  recommendations: Recommendations
}

export default function ScheduleTable({ rows, recommendations }: ScheduleTableProps) {
  const maxLoad = Math.max(...rows.map((r) => r.load_index), 1)

  return (
    <section className="glass animate-fade-up overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/70 p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-500/25 to-emerald-500/5 text-emerald-300">
            <CalendarClock size={17} />
          </span>
          <div>
            <h2 className="text-base font-semibold leading-tight text-white">
              Smart Schedule &amp; Resource Plan
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Daily forecast with truck allocation and collection priority
            </p>
          </div>
        </div>
        <span className="chip border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
          <Truck size={13} />
          {recommendations.collection_frequency}
        </span>
      </div>

      <div className="max-h-[440px] overflow-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur">
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
              <th className="px-5 py-3 font-semibold">Date</th>
              <th className="px-4 py-3 font-semibold">Volume</th>
              <th className="px-4 py-3 font-semibold">Load</th>
              <th className="px-4 py-3 font-semibold">Trucks</th>
              <th className="px-4 py-3 font-semibold">Load Index</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 font-semibold">Recommended Schedule</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.date}
                className="border-t border-slate-800/60 transition-colors hover:bg-slate-800/30"
              >
                <td className="whitespace-nowrap px-5 py-3">
                  <span className="font-medium text-slate-200">{formatDate(row.date)}</span>
                  <span className="ml-2 text-xs text-slate-500">{row.day}</span>
                </td>
                <td className="px-4 py-3 font-mono text-slate-300">
                  {formatNumber(row.volume, 1)}
                  <span className="ml-1 text-[11px] text-slate-600">m³</span>
                </td>
                <td className="px-4 py-3 font-mono text-slate-300">
                  {formatNumber(row.tons, 2)}
                  <span className="ml-1 text-[11px] text-slate-600">t</span>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 font-mono text-slate-200">
                    <Truck size={13} className="text-emerald-400" />
                    {row.trucks}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className={`h-full origin-left animate-bar-grow rounded-full ${
                          row.status === 'Critical Spike'
                            ? 'bg-rose-400'
                            : row.status === 'High Load'
                              ? 'bg-amber-400'
                              : 'bg-emerald-400'
                        }`}
                        style={{ width: `${Math.min(100, (row.load_index / maxLoad) * 100)}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs tabular text-slate-400">
                      {row.load_index.toFixed(2)}×
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={row.status} />
                </td>
                <td className="px-5 py-3 text-slate-400">{row.schedule}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-slate-500">
                  No schedule generated yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {recommendations.notes.length > 0 && (
        <div className="border-t border-slate-800/70 p-5">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <Info size={12} /> Operational notes
          </p>
          <ul className="grid grid-cols-1 gap-1.5 text-xs text-slate-400 sm:grid-cols-2">
            {recommendations.notes.map((note) => (
              <li key={note} className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-emerald-400" />
                {note}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
