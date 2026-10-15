import { AnimatePresence, motion } from 'framer-motion'
import { useSyncExternalStore } from 'react'
import { spring } from './motion'

type Kind = 'ok' | 'error' | 'info'
interface ToastItem { id: number; text: string; kind: Kind }

let items: ToastItem[] = []
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
const snapshot = () => items

/** Affiche une notification brève (disparaît seule ; se balaie du doigt pour la fermer). */
export function toast(text: string, kind: Kind = 'ok', ms = 3200) {
  const id = nextId++
  items = [...items.slice(-2), { id, text, kind }]
  emit()
  setTimeout(() => dismiss(id), ms)
}
const dismiss = (id: number) => { items = items.filter((t) => t.id !== id); emit() }

function Check({ kind }: { kind: Kind }) {
  const stroke = kind === 'ok' ? 'rgb(var(--ok))' : kind === 'error' ? 'rgb(var(--danger))' : 'rgb(var(--accent))'
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden className="shrink-0">
      <motion.circle cx="13" cy="13" r="11" fill="none" stroke={stroke} strokeWidth="2.2" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.45 }} />
      {kind === 'ok'
        ? <motion.path d="M7.5 13.5 l4 4 l7-8" fill="none" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, delay: 0.3 }} />
        : <motion.path d="M13 7.5 v7 M13 18 v.4" fill="none" stroke={stroke} strokeWidth="2.6" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.3, delay: 0.3 }} />}
    </svg>
  )
}

export default function ToastHost() {
  const list = useSyncExternalStore(subscribe, snapshot)
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[80] flex flex-col items-center gap-2 px-4 bottom-[calc(env(safe-area-inset-bottom)+92px)] rail:bottom-6"
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {list.map((t) => (
          <motion.div
            key={t.id}
            layout
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.6}
            onDragEnd={(_, i) => { if (Math.abs(i.offset.x) > 80 || Math.abs(i.velocity.x) > 500) dismiss(t.id) }}
            initial={{ opacity: 0, y: 40, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.18 } }}
            transition={spring}
            className="pointer-events-auto flex max-w-sm items-center gap-3 rounded-2xl bg-surface px-4 py-3 text-sm font-medium text-fg shadow-xl ring-1 ring-line backdrop-blur-xl"
            style={{ backdropFilter: 'blur(14px)' }}
            role="status"
          >
            <Check kind={t.kind} />
            <span>{t.text}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
