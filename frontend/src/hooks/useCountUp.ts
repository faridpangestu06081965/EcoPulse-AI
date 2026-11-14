import { useEffect, useRef, useState } from 'react'

/**
 * Smoothly animates a number towards `target` on every change.
 * Used for the headline KPI values so updates feel alive instead of jumping.
 */
export function useCountUp(target: number, duration = 750): number {
  const [value, setValue] = useState(target)
  const valueRef = useRef(target)
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    valueRef.current = value
  }, [value])

  useEffect(() => {
    if (!Number.isFinite(target)) return
    const from = Number.isFinite(valueRef.current) ? valueRef.current : target
    const start = performance.now()

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(from + (target - from) * eased)
      if (t < 1) frameRef.current = requestAnimationFrame(tick)
    }

    frameRef.current = requestAnimationFrame(tick)
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [target, duration])

  return value
}
