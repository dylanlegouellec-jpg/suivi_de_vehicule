import { useEffect, useState } from 'react'
import { useThemeState } from './theme'

/** Fond du thème Aurora : trois lumières floues qui dérivent lentement (en pause quand l'onglet est caché). */
export default function AuroraBackground() {
  const { theme } = useThemeState()
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    const on = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])
  if (theme !== 'aurora') return null
  return (
    <div className="aurora-layer" aria-hidden style={{ ['--p' as string]: hidden ? 'paused' : 'running' }}>
      <div className="aurora-blob b1" style={{ animationPlayState: hidden ? 'paused' : 'running' }} />
      <div className="aurora-blob b2" style={{ animationPlayState: hidden ? 'paused' : 'running' }} />
      <div className="aurora-blob b3" style={{ animationPlayState: hidden ? 'paused' : 'running' }} />
    </div>
  )
}
