// Régénère les icônes PNG de l'app à partir de branding/*.svg.
// Nécessite Playwright (npx playwright install chromium) : outil de design, pas une dépendance de l'app.
//   node scripts/gen-icons.mjs
import { readFileSync } from 'node:fs'

let chromium
try {
  ;({ chromium } = await import('playwright'))
} catch {
  console.error("Playwright est requis pour régénérer les icônes : npm i -D playwright (puis npx playwright install chromium)")
  process.exit(1)
}

const svg = (name) => readFileSync(new URL(`../branding/${name}`, import.meta.url), 'utf8')
const jobs = [
  ['logo.svg', 'pwa-192.png', 192],
  ['logo.svg', 'pwa-512.png', 512],
  ['logo-square.svg', 'pwa-maskable-512.png', 512],
  ['logo-square.svg', 'apple-touch-icon.png', 180],
]
const browser = await chromium.launch()
for (const [src, out, size] of jobs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(`<body style="margin:0;background:transparent">${svg(src).replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`)
  await page.screenshot({ path: new URL(`../public/${out}`, import.meta.url).pathname, omitBackground: true })
  await page.close()
  console.log('✓', out)
}
await browser.close()
