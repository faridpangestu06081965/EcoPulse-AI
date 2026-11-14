import { useId } from 'react'

interface SparklineProps {
  data: number[]
  color?: string
  strokeWidth?: number
}

/**
 * Tiny dependency-free area sparkline used inside the KPI cards.
 * Renders a gradient-filled smooth line without pulling in a chart library.
 */
export default function Sparkline({ data, color = '#10B981', strokeWidth = 2 }: SparklineProps) {
  const gradientId = useId()
  if (data.length < 2) return null

  const w = 132
  const h = 40
  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min || 1
  const step = w / (data.length - 1)

  const points = data.map((v, i) => {
    const x = i * step
    const y = h - ((v - min) / span) * (h - 8) - 4
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })

  const line = `M${points.join(' L')}`
  const area = `${line} L${w},${h} L0,${h} Z`

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-10 w-full">
      <defs>
        <linearGradient id={`spark-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.38} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
