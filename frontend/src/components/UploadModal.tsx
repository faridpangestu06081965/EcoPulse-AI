import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Loader2,
  UploadCloud,
  X,
} from 'lucide-react'
import { extractErrorMessage, uploadDataset } from '../api/client'
import type { UploadResponse } from '../types'
import { formatCompact } from '../utils/format'

interface UploadModalProps {
  open: boolean
  onClose: () => void
  onUploaded: (result: UploadResponse) => void
}

export default function UploadModal({ open, onClose, onUploaded }: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [retrain, setRetrain] = useState(true)
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<UploadResponse | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  useEffect(() => {
    if (open) {
      setFile(null)
      setProgress(0)
      setError(null)
      setResult(null)
      setBusy(false)
    }
  }, [open])

  if (!open) return null

  const pickFile = (candidate: File | null | undefined) => {
    if (!candidate) return
    if (!candidate.name.toLowerCase().endsWith('.csv')) {
      setError('Only .csv datasets are supported.')
      return
    }
    setError(null)
    setFile(candidate)
  }

  const handleUpload = async () => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const response = await uploadDataset(file, retrain, setProgress)
      setResult(response)
      onUploaded(response)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm animate-fade-in"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div className="glass w-full max-w-lg animate-fade-up p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-500/25 to-cyan-500/10 text-emerald-300">
              <UploadCloud size={18} />
            </span>
            <div>
              <h2 className="text-lg font-semibold leading-tight text-white">Upload new dataset</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Ingest a municipal solid waste CSV to refresh the forecast models.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="focus-ring rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        {!result ? (
          <>
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                pickFile(e.dataTransfer.files?.[0])
              }}
              onClick={() => inputRef.current?.click()}
              className={`mt-5 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-9 text-center transition-all duration-200 ${
                dragging
                  ? 'border-emerald-400 bg-emerald-500/10 shadow-glow-soft'
                  : 'border-slate-700 bg-slate-900/40 hover:border-slate-600 hover:bg-slate-900/60'
              }`}
            >
              <span
                className={`grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500/25 to-cyan-500/10 text-emerald-300 transition-transform duration-200 ${
                  dragging ? 'scale-110' : ''
                }`}
              >
                <UploadCloud size={22} />
              </span>
              <p className="mt-3 text-sm font-medium text-slate-200">
                {file ? file.name : 'Drag & drop a CSV here'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {file
                  ? `${(file.size / 1024).toFixed(0)} KB · click to replace`
                  : 'or click to browse · columns are auto-detected'}
              </p>
              <input
                ref={inputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0])}
              />
            </div>

            <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/50 px-3.5 py-3">
              <input
                type="checkbox"
                checked={retrain}
                onChange={(e) => setRetrain(e.target.checked)}
                className="h-4 w-4 accent-emerald-500"
              />
              <span className="text-sm text-slate-300">
                Retrain all models after upload
                <span className="block text-[11px] text-slate-500">
                  Runs in the background — the dashboard stays responsive.
                </span>
              </span>
            </label>

            {busy && (
              <div className="mt-4">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="mt-2 text-center text-xs text-slate-500">
                  Uploading… {progress}%
                </p>
              </div>
            )}

            {error && (
              <p className="mt-4 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-300">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                {error}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="btn-ghost focus-ring px-4 py-2.5 text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUpload}
                disabled={!file || busy}
                className="btn-primary focus-ring flex items-center gap-2 px-5 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                {busy ? 'Processing…' : 'Upload & Analyze'}
              </button>
            </div>
          </>
        ) : (
          <div className="mt-5">
            <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-500/20 text-emerald-300">
                <CheckCircle2 size={18} />
              </span>
              <div>
                <p className="text-sm font-semibold text-emerald-200">Dataset ingested</p>
                <p className="mt-0.5 text-xs text-emerald-300/80">{result.message}</p>
              </div>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              {[
                ['File', result.dataset.name],
                ['Records', formatCompact(result.dataset.rows)],
                ['Zones', String(result.dataset.areas.length)],
                ['Waste types', String(result.dataset.waste_types.length)],
                ['From', result.dataset.start_date],
                ['To', result.dataset.end_date],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/50 px-3.5 py-2.5">
                  <dt className="text-[11px] uppercase tracking-wider text-slate-500">{label}</dt>
                  <dd className="mt-0.5 truncate font-medium text-slate-200">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="btn-primary focus-ring px-5 py-2.5 text-sm"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
