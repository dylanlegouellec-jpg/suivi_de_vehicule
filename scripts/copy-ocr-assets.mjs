// Copie les ressources OCR (worker, cœur WASM, langue française) dans public/tesseract
// afin que l'OCR fonctionne hors ligne et sans appel à un CDN tiers.
import { copyFileSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const out = `${root}public/tesseract`
mkdirSync(`${out}/lang`, { recursive: true })

const files = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js'],
  ['node_modules/@tesseract.js-data/fra/4.0.0_best_int/fra.traineddata.gz', 'lang/fra.traineddata.gz'],
]
for (const [src, dst] of files) {
  if (!existsSync(root + src)) throw new Error(`Ressource OCR introuvable : ${src} (lancez npm install)`)
  copyFileSync(root + src, `${out}/${dst}`)
}
console.log('Ressources OCR copiées dans public/tesseract')
