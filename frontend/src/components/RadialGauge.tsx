import { useId } from 'react'

interface RadialGaugeProps {
  /** 0 - 100 */
  value: number
  size?: number
  strokeWidth?: number
}

/**
 * 270° radial gauge used for the model accuracy score.
 * Draws a gradient arc plus a soft glow, entirely in SVG.
 */
export default function RadialGauge({ value, size = 92, strokeWidth = 9 }: RadialGaugeProps) {
  const gradientId = useId()
  const clamped = Math.max(0, Math.min(100, value))

  const radius = (size - strokeWidth) / 2
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * radius
  const arc = circumference * 0.75 // 270 degrees

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
      <defs>
        <linearGradient id={`gauge-${gradientId}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8B5CF6" />
          <stop offset="55%" stopColor="#06B6D4" />
          <stop offset="100%" stopColor="#10B981" />
        </linearGradient>
        <filter id={`glow-${gradientId}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g transform={`rotate(135 ${cx} ${cy})`}>
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="rgba(51,65,85,0.55)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${arc} ${circumference}`}
        />
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={`url(#gauge-${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${(arc * clamped) / 100} ${circumference}`}
          filter={`url(#glow-${gradientId})`}
          style={{ transition: 'stroke-dasharray 0.9s cubic-bezier(0.22,1,0.36,1)' }}
        />
      </g>
    </svg>
  )
}
