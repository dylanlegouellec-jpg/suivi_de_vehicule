import { motion } from 'framer-motion'
import { spring } from '../ui/motion'

export default function ProgressBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="h-3 overflow-hidden rounded-full bg-surface2">
        <motion.div className="relative h-full overflow-hidden rounded-full" style={{ background: 'var(--btn-bg)' }} initial={false} animate={{ width: `${pct}%` }} transition={spring}>
          <span className="absolute inset-0 animate-pulse bg-white/20" />
        </motion.div>
      </div>
      <p className="mt-1 text-center text-sm text-muted">{label} {pct} %</p>
    </div>
  )
}
