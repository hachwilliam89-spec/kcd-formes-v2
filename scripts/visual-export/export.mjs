#!/usr/bin/env node
// Exporte les visuels du VRAI GameScene web vers le client Godot.
//
// Pour chaque carte : sol (PNG), manifeste du décor (decor.json) et ses textures,
// écrits dans client-godot/assets/baked/<carte>/ (hors git : dérivés d'assets
// sous licence). Option --reference : captures du web pendant une vague
// déterministe + ses ticks, pour comparer le rendu Godot (dossier --out).
//
// Option --bench : la vague du banc de charge (générateur de scripts/perf-bench)
// en bench.json, rejouée par l'écran « Banc de perf » du client Godot.
//
// Usage : npm run export [-- --maps desert,spring] [-- --bench --maps desert]
//         [-- --reference --out /tmp/ref]
import { build } from 'esbuild'
import { chromium } from 'playwright-core'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const front = path.join(root, 'frontend-web')

const { values: opt } = parseArgs({
    options: {
        maps: { type: 'string', default: 'desert,fourche,spring,autumn' },
        reference: { type: 'boolean', default: false },
        bench: { type: 'boolean', default: false },
        out: { type: 'string', default: path.join(root, 'client-godot/assets/baked') },
        software: { type: 'boolean', default: false },
    },
})
if (!fs.existsSync(path.join(front, 'public/sprites'))) {
    console.error('Assets introuvables (frontend-web/public/sprites) — voir scripts/unpack-assets.sh.')
    process.exit(1)
}

const PHASER_DIST = path.join(front, 'node_modules/phaser/dist/phaser.js')
const phaserGlobal = {
    name: 'phaser-global',
    setup(b) {
        b.onResolve({ filter: /^phaser$/ }, () => ({ path: 'phaser', namespace: 'phaser-global' }))
        b.onLoad({ filter: /.*/, namespace: 'phaser-global' }, () => ({ contents: 'module.exports = window.Phaser', loader: 'js' }))
    },
}
await build({
    entryPoints: [path.join(here, 'entry.ts')], bundle: true, outfile: path.join(here, 'dist/bundle.js'),
    alias: { '@': front }, plugins: [phaserGlobal], target: 'es2022', logLevel: 'warning',
})

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.webp': 'image/webp' }
const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0])
    const file = url === '/' ? path.join(here, 'index.html')
        : url === '/phaser.js' ? PHASER_DIST
        : /^\/(sprites|sounds)\//.test(url) ? path.join(front, 'public', url)
        : path.join(here, 'dist', url)
    fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); res.end(); return }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' })
        res.end(data)
    })
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const port = server.address().port

const browser = await chromium.launch({
    ...(process.env.BENCH_CHROME ? { executablePath: process.env.BENCH_CHROME } : { channel: 'chrome' }),
    headless: true,
    args: opt.software ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : [],
})
const dataUrl = (s) => Buffer.from(s.split(',')[1], 'base64')
const safe = (k) => k.replace(/[^A-Za-z0-9_-]/g, '_')

for (const map of opt.maps.split(',')) {
    const page = await browser.newPage({ viewport: { width: 800, height: 640 } })
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    const mode = opt.bench ? 'bench' : opt.reference ? 'wave' : 'export'
    await page.goto(`http://localhost:${port}/?map=${map}&mode=${mode}`)
    await page.waitForFunction(() => window.__done, null, { timeout: 5 * 60_000, polling: 200 })
    const err = await page.evaluate(() => window.__error)
    if (err) throw new Error(`${map} : ${err}`)
    const dir = path.join(opt.out, map)
    fs.mkdirSync(path.join(dir, 'textures'), { recursive: true })
    if (opt.bench) {
        const data = await page.evaluate(() => window.__export)
        fs.writeFileSync(path.join(dir, 'bench.json'), JSON.stringify(data))
        const peak = Math.max(...data.ticks.map((t) => t.enemies.length))
        console.log(`${map} : vague du banc (${data.enemies} ennemis, ${data.towers.length} tours, ${data.ticks.length} ticks, jusqu'à ${peak} à l'écran)`)
    } else if (opt.reference) {
        const { data, shots } = await page.evaluate(() => ({ data: window.__export, shots: window.__shots }))
        fs.writeFileSync(path.join(dir, 'wave.json'), JSON.stringify(data))
        for (const s of shots) fs.writeFileSync(path.join(dir, `web_tick${s.tick}.png`), dataUrl(s.png))
        console.log(`${map} : ${shots.length} captures de référence, ${data.ticks.length} ticks`)
    } else {
        const data = await page.evaluate(() => window.__export)
        fs.writeFileSync(path.join(dir, 'ground.png'), dataUrl(data.ground))
        const files = {}
        for (const [key, url] of Object.entries(data.textures)) {
            files[key] = `textures/${safe(key)}.png`
            fs.writeFileSync(path.join(dir, files[key]), dataUrl(url))
        }
        const items = data.items.map((it) => (it.texture ? { ...it, texture: files[it.texture] } : it))
        const unsupported = items.filter((it) => it.unsupported)
        fs.writeFileSync(path.join(dir, 'decor.json'), JSON.stringify({
            map: data.map, cellSize: data.cellSize, width: data.width, height: data.height,
            ground: 'ground.png', groundCoversDepth0: data.groundCoversDepth0, items: items.filter((it) => it.texture),
        }, null, 1))
        console.log(`${map} : sol + ${items.length - unsupported.length} éléments de décor, ${Object.keys(files).length} textures`
            + (unsupported.length ? ` — ${unsupported.length} non exportables : ${JSON.stringify(unsupported)}` : ''))
    }
    if (errors.length) console.log(`  erreurs de la page (${map}) :`, errors)
    await page.close()
}
await browser.close()
server.close()
