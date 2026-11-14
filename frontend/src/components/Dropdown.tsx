import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

export interface DropdownOption {
  value: string
  label: string
  hint?: string
}

interface DropdownProps {
  label: string
  icon?: React.ReactNode
  value: string
  options: DropdownOption[]
  onChange: (value: string) => void
  disabled?: boolean
}

interface MenuPosition {
  left: number
  width: number
  maxHeight: number
  top?: number
  bottom?: number
}

/**
 * Accessible glassmorphic select.
 *
 * The option menu is rendered through a portal to <body> with fixed positioning
 * so it is never clipped or buried by the ancestor glass panels (which create
 * their own stacking contexts via backdrop-filter).
 */
export default function Dropdown({
  label,
  icon,
  value,
  options,
  onChange,
  disabled = false,
}: DropdownProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<MenuPosition | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.value === value)

  const place = () => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const gap = 8
    const spaceBelow = window.innerHeight - r.bottom - gap - 8
    const spaceAbove = r.top - gap - 8
    const openUp = spaceBelow < 220 && spaceAbove > spaceBelow
    setPos({
      left: r.left,
      width: r.width,
      maxHeight: Math.max(160, Math.min(288, openUp ? spaceAbove : spaceBelow)),
      ...(openUp ? { bottom: window.innerHeight - r.top + gap } : { top: r.bottom + gap }),
    })
  }

  useLayoutEffect(() => {
    if (!open) return
    place()
    const onReflow = () => place()
    window.addEventListener('resize', onReflow)
    window.addEventListener('scroll', onReflow, true)
    return () => {
      window.removeEventListener('resize', onReflow)
      window.removeEventListener('scroll', onReflow, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative min-w-0">
      <span className="kicker mb-1.5 block">{label}</span>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`focus-ring flex w-full items-center justify-between gap-2 rounded-xl border bg-slate-900 px-3.5 py-2.5 text-left text-sm font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${
          open
            ? 'border-emerald-500/40 text-white shadow-[0_0_22px_-8px_rgba(16,185,129,0.6)]'
            : 'border-slate-800 text-slate-100 hover:border-slate-700'
        }`}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          {icon && <span className="shrink-0 text-emerald-400">{icon}</span>}
          <span className="truncate">{selected?.label ?? '—'}</span>
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 transition-transform duration-200 ${
            open ? 'rotate-180 text-emerald-400' : 'text-slate-500'
          }`}
        />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              left: pos.left,
              width: pos.width,
              maxHeight: pos.maxHeight,
              ...(pos.top !== undefined ? { top: pos.top } : { bottom: pos.bottom }),
            }}
            className="z-[9999] animate-scale-in origin-top overflow-auto rounded-xl border border-slate-700 bg-slate-900 p-1.5 shadow-2xl ring-1 ring-black/60"
          >
            {options.map((option) => {
              const active = option.value === value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    active
                      ? 'bg-gradient-to-r from-emerald-500/20 to-cyan-500/10 text-emerald-200'
                      : 'text-slate-300 hover:bg-slate-800/70 hover:text-slate-100'
                  }`}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{option.label}</span>
                    {option.hint && (
                      <span className="truncate text-[11px] text-slate-500">{option.hint}</span>
                    )}
                  </span>
                  {active && <Check size={15} className="shrink-0 text-emerald-400" />}
                </button>
              )
            })}
          </div>,
          document.body,
        )}
    </div>
  )
}
