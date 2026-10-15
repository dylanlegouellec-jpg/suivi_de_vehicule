/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: { brand: { DEFAULT: '#2563eb', dark: '#1d4ed8' } },
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
