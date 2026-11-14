import { Activity, Database, FileUp, Info, Leaf, RefreshCw } from 'lucide-react'
import type { DatasetMeta } from '../types'
import { formatCompact } from '../utils/format'

interface NavbarProps {
  dataset: DatasetMeta | null
  trainingInProgress: boolean
  onUploadClick: () => void
  onRefresh: () => void
  onInfoClick: () => void
  refreshing: boolean
}

export default function Navbar({
  dataset,
  trainingInProgress,
  onUploadClick,
  onRefresh,
  onInfoClick,
  refreshing,
}: NavbarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-800/60 bg-slate-950/60 backdrop-blur-2xl">
      <div className="pointer-events-none absolute inset-x-0 -bottom-px h-px bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />

      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
        {/* Logo + title */}
        <div className="flex items-center gap-3">
          <div className="relative grid h-11 w-11 place-items-center rounded-2xl bg-slate-900/80">
            <span className="absolute inset-0 animate-spin-slow rounded-2xl bg-[conic-gradient(from_0deg,#10B981,#06B6D4,#8B5CF6,#10B981)] opacity-70 blur-[6px]" />
            <span className="absolute inset-[1.5px] rounded-[14px] bg-slate-950" />
            <Leaf size={20} className="relative text-emerald-400" strokeWidth={2.6} />
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-slate-950 bg-emerald-400 shadow-glow-soft" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight text-white">
              EcoPulse <span className="gradient-text">AI</span>
            </h1>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
              Smart City Waste Forecasting
            </p>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2.5">
          {/* Live status */}
          <span className="hidden items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/[0.07] px-3 py-1.5 text-[11px] font-semibold text-emerald-300 sm:flex">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            Engine online
          </span>

          {/* Active dataset indicator */}
          {dataset && (
            <div className="hidden items-center gap-2.5 rounded-xl border border-slate-800/70 bg-slate-900/50 px-3.5 py-2 lg:flex">
              <Database size={15} className="text-cyan-400" />
              <div className="leading-tight">
                <p className="max-w-[220px] truncate text-xs font-semibold text-slate-200">
                  {dataset.name}
                </p>
                <p className="text-[10px] text-slate-500">
                  {formatCompact(dataset.rows)} records · {dataset.start_date} → {dataset.end_date}
                </p>
              </div>
            </div>
          )}

          {trainingInProgress && (
            <span className="chip border-amber-500/30 bg-amber-500/10 text-amber-300">
              <Activity size={13} className="animate-pulse" />
              Retraining…
            </span>
          )}

          <button
            type="button"
            onClick={onInfoClick}
            className="btn-ghost focus-ring flex items-center gap-2 px-3.5 py-2.5 text-sm"
            title="Data source, data type & models"
          >
            <Info size={15} />
            <span className="hidden sm:inline">Data &amp; Model</span>
          </button>

          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="btn-ghost focus-ring flex items-center gap-2 px-3.5 py-2.5 text-sm disabled:opacity-60"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            type="button"
            onClick={onUploadClick}
            className="btn-primary focus-ring flex items-center gap-2 px-4 py-2.5 text-sm"
          >
            <FileUp size={16} strokeWidth={2.5} />
            Upload CSV
          </button>
        </div>
      </div>
    </header>
  )
}
