/** @type {import('tailwindcss').Config} */

// Couleurs lues dans les variables CSS du thème actif (voir src/index.css) : un seul code, trois ambiances.
// `alpha` : certaines variables (verre dépoli) portent leur propre transparence.
const token = (name, alphaVar) => ({ opacityValue }) => {
  const a = alphaVar ? `var(--${alphaVar})` : null
  const o = opacityValue === undefined ? null : opacityValue
  const alpha = a && o ? `calc(${o} * ${a})` : (a ?? o ?? '1')
  return `rgb(var(--${name}) / ${alpha})`
}

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Les thèmes Cockpit et Aurora sont sombres, Fluide est clair : data-mode pilote les variantes `dark:`.
  darkMode: ['selector', '[data-mode="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        surface: token('surface', 'surface-a'),
        surface2: token('surface2', 'surface2-a'),
        line: token('line', 'line-a'),
        fg: token('fg'),
        muted: token('muted'),
        accent: token('accent'),
        'accent-fg': token('accent-fg'),
        accent2: token('accent2'),
        danger: token('danger'),
        warn: token('warn'),
        ok: token('ok'),
        brand: token('accent'),
      },
      borderRadius: { card: 'var(--radius)' },
      screens: {
        // Menu latéral au lieu de la barre du bas : écran assez large, ou téléphone en paysage (peu de hauteur).
        rail: { raw: '(min-width: 768px), (orientation: landscape) and (max-height: 500px)' },
        desktop: '1024px',
        short: { raw: '(max-height: 500px)' },
      },
    },
  },
  plugins: [],
}
