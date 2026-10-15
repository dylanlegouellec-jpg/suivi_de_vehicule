import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import CarAnimation from './CarAnimation'
import { easeOut } from './motion'
import { getReducedMotion } from './theme'

const KEY = 'autosuivi.splash'
const seen = () => { try { return sessionStorage.getItem(KEY) === '1' } catch { return false } }

/** Écran de démarrage (une fois par session) : la voiture arrive, le nom se dévoile. Touchez pour passer. */
export default function Splash() {
  const [show, setShow] = useState(() => !seen() && !new URLSearchParams(location.search).has('reset'))

  useEffect(() => {
    if (!show) return
    try { sessionStorage.setItem(KEY, '1') } catch { /* ignoré */ }
    const t = setTimeout(() => setShow(false), getReducedMotion() ? 450 : 2100)
    return () => clearTimeout(t)
  }, [show])

  const letters = [...'Auto'].map((c) => ({ c, bold: true })).concat([...'Suivi'].map((c) => ({ c, bold: false })))

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="splash"
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-bg"
          exit={{ opacity: 0, scale: 1.06, filter: 'blur(8px)', transition: { duration: 0.45, ease: 'easeIn' } }}
          onClick={() => setShow(false)}
          role="presentation"
        >
          <div className="relative">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i} className="absolute h-[3px] rounded-full bg-accent/60"
                style={{ top: 70 + i * 20, left: -70 - i * 10 }}
                initial={{ width: 0, opacity: 0 }} animate={{ width: [0, 70, 0], opacity: [0, 0.8, 0], x: [0, 60, 120] }}
                transition={{ duration: 1.1, delay: 0.1 + i * 0.12, ease: 'easeOut', repeat: 1 }}
              />
            ))}
            <motion.div initial={{ x: -280, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 70, damping: 15, mass: 1.1 }}>
              <CarAnimation size={230} />
            </motion.div>
          </div>
          <div className="flex text-5xl tracking-tight text-fg" aria-label="AutoSuivi">
            {letters.map((l, i) => (
              <motion.span
                key={i} aria-hidden
                className={l.bold ? 'font-extrabold' : 'font-light text-accent'}
                initial={{ y: 28, opacity: 0, filter: 'blur(6px)' }} animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
                transition={{ delay: 0.75 + i * 0.07, duration: 0.5, ease: easeOut }}
              >{l.c}</motion.span>
            ))}
          </div>
          <motion.p className="text-sm text-muted" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.45, duration: 0.5 }}>
            Le suivi de vos véhicules
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
