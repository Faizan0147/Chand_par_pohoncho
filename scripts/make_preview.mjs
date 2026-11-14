// Inlines public/data/*.json into the single-file build so it runs from file:// or any static host.
import fs from 'node:fs'
const html = fs.readFileSync('dist-preview/index.html', 'utf8')
const data = { ephemeris: JSON.parse(fs.readFileSync('public/data/ephemeris.json', 'utf8')), sites: JSON.parse(fs.readFileSync('public/data/sites.json', 'utf8')) }
if (fs.existsSync('public/data/validation.json')) data.validation = JSON.parse(fs.readFileSync('public/data/validation.json', 'utf8'))
const tag = `<script>window.__RIMLIGHT_DATA__=${JSON.stringify(data)}</script>`
fs.writeFileSync('dist-preview/rimlight-preview.html', html.replace('<head>', '<head>' + tag))
console.log('wrote dist-preview/rimlight-preview.html', (fs.statSync('dist-preview/rimlight-preview.html').size / 1024).toFixed(0), 'KB')
