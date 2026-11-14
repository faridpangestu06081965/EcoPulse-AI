/**
 * Ambient, slowly drifting aurora + grid backdrop that sits behind the whole app.
 * Pure CSS so it costs nothing on the main thread beyond compositing.
 */
export default function AuroraBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[#04070D]" />

      <div className="aurora-blob animate-aurora -left-56 -top-64 h-[46rem] w-[46rem] bg-emerald-500/25" />
      <div
        className="aurora-blob animate-aurora -right-40 -top-52 h-[40rem] w-[40rem] bg-cyan-500/20"
        style={{ animationDelay: '-7s' }}
      />
      <div
        className="aurora-blob animate-aurora left-[34%] top-[42%] h-[38rem] w-[38rem] bg-violet-600/14"
        style={{ animationDelay: '-13s' }}
      />
      <div
        className="aurora-blob animate-aurora -bottom-52 -left-32 h-[34rem] w-[34rem] bg-teal-500/14"
        style={{ animationDelay: '-4s' }}
      />

      <div className="bg-grid-soft bg-grid mask-fade-b absolute inset-0 opacity-70" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_-10%,transparent_30%,rgba(4,7,13,0.9)_100%)]" />
      <div className="bg-noise absolute inset-0 opacity-[0.035] mix-blend-soft-light" />
    </div>
  )
}
