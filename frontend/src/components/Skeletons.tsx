/** Loading placeholders that mirror the real dashboard layout. */

export function KpiCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="glass p-5">
          <div className="flex items-center justify-between">
            <div className="skeleton h-3 w-24" />
            <div className="skeleton h-9 w-9 rounded-xl" />
          </div>
          <div className="skeleton mt-4 h-8 w-32" />
          <div className="skeleton mt-3 h-3 w-20" />
        </div>
      ))}
    </div>
  )
}

export function ChartSkeleton({ height = 360 }: { height?: number }) {
  return (
    <div className="glass p-5" style={{ height }}>
      <div className="skeleton h-4 w-44" />
      <div className="skeleton mt-2 h-3 w-64" />
      <div className="mt-6 flex h-[70%] items-end gap-3">
        {Array.from({ length: 16 }).map((_, i) => (
          <div
            key={i}
            className="skeleton flex-1"
            style={{ height: `${25 + Math.abs(Math.sin(i * 1.3)) * 65}%` }}
          />
        ))}
      </div>
    </div>
  )
}

export function TableSkeleton() {
  return (
    <div className="glass p-5">
      <div className="skeleton h-4 w-56" />
      <div className="mt-5 space-y-2.5">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="skeleton h-10 w-full" />
        ))}
      </div>
    </div>
  )
}
