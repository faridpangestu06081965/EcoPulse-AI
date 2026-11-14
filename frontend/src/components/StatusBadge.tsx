import type { ForecastStatus } from '../types'
import { STATUS_STYLES } from '../utils/format'

const DOT: Record<string, string> = {
  Normal: 'bg-emerald-400',
  'High Load': 'bg-amber-400',
  'Critical Spike': 'bg-rose-400',
}

export default function StatusBadge({ status }: { status: ForecastStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
        STATUS_STYLES[status] ?? STATUS_STYLES.Normal
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[status] ?? DOT.Normal}`} />
      {status}
    </span>
  )
}
