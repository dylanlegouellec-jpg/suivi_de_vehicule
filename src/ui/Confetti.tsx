import { useEffect, useRef } from 'react'
import { getReducedMotion } from './theme'

type Burst = { x: number; y: number }
const listeners = new Set<(b: Burst) => void>()

/** Lance une gerbe de confettis (à la position donnée, sinon au centre de l'écran). Sans effet si les animations sont réduites. */
export function fireConfetti(at?: Partial<Burst>) {
  if (getReducedMotion()) return
  const b = { x: at?.x ?? innerWidth / 2, y: at?.y ?? innerHeight * 0.45 }
  listeners.forEach((l) => l(b))
}

interface Particle { x: number; y: number; vx: number; vy: number; w: number; h: number; rot: number; vr: number; color: string; life: number }

const cssColor = (name: string) => `rgb(${getComputedStyle(document.documentElement).getPropertyValue(name).trim().replace(/\s+/g, ' ')})`

/** Canvas plein écran (non cliquable) qui dessine les confettis. */
export default function ConfettiHost() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    let particles: Particle[] = []
    let raf = 0
    const dpr = Math.min(devicePixelRatio || 1, 2)
    const resize = () => { canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr }
    resize()
    addEventListener('resize', resize)

    const step = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      particles = particles.filter((p) => p.life > 0 && p.y < innerHeight + 40)
      for (const p of particles) {
        p.vy += 0.22; p.vx *= 0.992; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= 1
        ctx.save()
        ctx.translate(p.x * dpr, p.y * dpr)
        ctx.rotate(p.rot)
        ctx.globalAlpha = Math.min(1, p.life / 30)
        ctx.fillStyle = p.color
        ctx.fillRect((-p.w / 2) * dpr, (-p.h / 2) * dpr, p.w * dpr, p.h * dpr)
        ctx.restore()
      }
      raf = particles.length ? requestAnimationFrame(step) : 0
      if (!particles.length) ctx.clearRect(0, 0, canvas.width, canvas.height)
    }

    const onBurst = ({ x, y }: Burst) => {
      const palette = [cssColor('--accent'), cssColor('--accent2'), cssColor('--ok'), cssColor('--warn'), '#ffffff']
      for (let i = 0; i < 110; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1
        const sp = 6 + Math.random() * 9
        particles.push({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          w: 5 + Math.random() * 6, h: 3 + Math.random() * 5, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
          color: palette[i % palette.length], life: 90 + Math.random() * 50,
        })
      }
      if (!raf) raf = requestAnimationFrame(step)
    }
    listeners.add(onBurst)
    return () => { listeners.delete(onBurst); cancelAnimationFrame(raf); removeEventListener('resize', resize) }
  }, [])

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-[90] h-full w-full" />
}
