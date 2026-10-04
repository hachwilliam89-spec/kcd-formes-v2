#!/usr/bin/env node
// Banc de charge de la GameScene : compile entry.ts (esbuild), le sert avec les
// assets du front, l'ouvre dans Chrome (Playwright) et affiche le temps CPU par
// image. Voir README.md pour l'installation et l'interprétation.
import { build } from 'esbuild'
import { chromium } from 'playwright-core'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const front = path.resolve(here, '../../frontend-web')

const { values: opt } = parseArgs({
    options: {
        serve: { type: 'boolean', default: false }, // aperçu manuel sans pilote navigateur
        seasonal: { type: 'boolean', default: false },
        enemies: { type: 'string', default: '200' },
        towers: { type: 'string', default: '32' },
        map: { type: 'string', default: 'desert' },
        seed: { type: 'string', default: '1' },
        idle: { type: 'boolean', default: false },     // coût fixe d'une image, sans vague
        headed: { type: 'boolean', default: false },   // fenêtre visible (vrai GPU, vraie vsync)
        software: { type: 'boolean', default: false }, // rendu logiciel SwiftShader (machine sans GPU)
        profile: { type: 'boolean', default: false },  // top des fonctions (profil CPU)
        json: { type: 'boolean', default: false },     // sortie brute
        help: { type: 'boolean', short: 'h', default: false },
    },
})

if (opt.help) {
    console.log(`Usage : npm run bench -- [--enemies 200] [--towers 32] [--map desert|fourche|spring|autumn]
                       [--idle] [--headed] [--software] [--profile] [--json]
                       [--serve] [--seasonal]`)
    process.exit(0)
}
if (!fs.existsSync(path.join(front, 'public/sprites'))) {
    console.error('Assets introuvables (frontend-web/public/sprites) — voir scripts/unpack-assets.sh.')
    process.exit(1)
}

// 1. Bundle : la vraie scène du jeu. Phaser est chargé À PART (dist/phaser.js,
// même version que le jeu) : le profil CPU peut alors nommer ses fonctions
// d'après la documentation (@method) restée dans ce fichier.
const PHASER_DIST = path.join(front, 'node_modules/phaser/dist/phaser.js')
const phaserGlobal = {
    name: 'phaser-global',
    setup(b) {
        b.onResolve({ filter: /^phaser$/ }, () => ({ path: 'phaser', namespace: 'phaser-global' }))
        b.onLoad({ filter: /.*/, namespace: 'phaser-global' }, () => ({ contents: 'module.exports = window.Phaser', loader: 'js' }))
    },
}
await build({
    entryPoints: [path.join(here, opt.seasonal ? 'seasonal.ts' : 'entry.ts')],
    bundle: true,
    outfile: path.join(here, 'dist/bundle.js'),
    alias: { '@': front },
    plugins: [phaserGlobal],
    target: 'es2022',
    keepNames: true,
    logLevel: 'warning',
})

// 2. Serveur statique : page + bundle ici, sprites/sons depuis frontend-web/public.
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' }
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
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port

if (opt.serve) {
    console.log(`Aperçu manuel : http://localhost:${port}/?map=${opt.map}`)
    await new Promise(() => {})
}

// 3. Chrome : celui installé (channel chrome), ou BENCH_CHROME=/chemin/vers/chrome.
const browser = await chromium.launch({
    ...(process.env.BENCH_CHROME ? { executablePath: process.env.BENCH_CHROME } : { channel: 'chrome' }),
    headless: !opt.headed,
    args: opt.software ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : [],
})
const page = await browser.newPage({ viewport: { width: 1000, height: 800 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))

const cdp = await page.context().newCDPSession(page)
const query = new URLSearchParams({
    enemies: opt.enemies, towers: opt.towers, map: opt.map, seed: opt.seed, mode: opt.idle ? 'idle' : 'wave',
})
await page.goto(`http://localhost:${port}/?${query}`)
if (opt.profile) {
    // Profil limité à la mesure (pas au chargement) : démarré au signal de la page.
    await cdp.send('Profiler.enable')
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
    await page.waitForFunction(() => window.__recording, null, { timeout: 120_000, polling: 20 })
    await cdp.send('Profiler.start')
}
await page.waitForFunction(() => window.__bench, null, { timeout: 15 * 60_000, polling: 500 })
const result = await page.evaluate(() => window.__bench)

let topFunctions = []
if (opt.profile) {
    const { profile } = await cdp.send('Profiler.stop')
    // Fonctions du jeu : nommées dans le bundle, fichier retrouvé via les commentaires
    // de module d'esbuild. Fonctions de Phaser (souvent anonymes) : nommées d'après
    // le dernier @method / @function / @class qui les précède dans dist/phaser.js.
    const bundleLines = fs.readFileSync(path.join(here, 'dist/bundle.js'), 'utf8').split('\n')
    const modules = []
    bundleLines.forEach((l, i) => { const m = /^\s*\/\/ (\S+\.(?:[jt]sx?|mjs))$/.exec(l); if (m) modules.push([i, m[1]]) })
    const phaserLines = fs.readFileSync(PHASER_DIST, 'utf8').split('\n')
    const docAt = new Array(phaserLines.length)
    let lastDoc = 'Phaser'
    phaserLines.forEach((l, i) => { const m = /@(?:method|function|class)\s+(\S+)/.exec(l); if (m) lastDoc = m[1]; docAt[i] = lastDoc })
    const nearest = (list, line) => {
        let lo = 0, hi = list.length - 1, found = '?'
        while (lo <= hi) { const mid = (lo + hi) >> 1; if (list[mid][0] <= line) { found = list[mid][1]; lo = mid + 1 } else hi = mid - 1 }
        return found
    }
    const describe = (f) => {
        if (f.url.endsWith('/phaser.js')) return `${docAt[f.lineNumber] ?? 'Phaser'}`
        if (f.url.endsWith('/bundle.js')) {
            const file = nearest(modules, f.lineNumber).replace(/^.*frontend-web\//, '')
            return `${f.functionName || '(anonyme)'} — ${file}`
        }
        return `${f.functionName || '(anonyme)'} (navigateur)`
    }
    const byId = new Map(profile.nodes.map((n) => [n.id, n]))
    const self = new Map()
    profile.samples.forEach((id, i) => {
        const key = describe(byId.get(id).callFrame)
        self.set(key, (self.get(key) ?? 0) + (profile.timeDeltas[i] ?? 0))
    })
    const busy = [...self.entries()].filter(([k]) => !k.startsWith('(idle)') && !k.startsWith('(program)') && !k.startsWith('(root)'))
    const total = busy.reduce((sum, [, v]) => sum + v, 0)
    topFunctions = busy.sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => ({ fonction: k, part: +(100 * v / total).toFixed(1) }))
}

await browser.close()
server.close()

if (opt.json) {
    console.log(JSON.stringify({ ...result, topFunctions, errors }, null, 2))
} else {
    const r = result
    const fr = (x) => String(x).replace('.', ',')
    console.log(`\nBanc KCD — carte ${r.map}, ${r.towers} tours, ${r.mode === 'idle'
        ? 'sans vague'
        : `${r.enemies} ennemis (jusqu'à ${r.maxOnScreen} à l'écran, ${r.killed} tués, ${r.reached} au château)`}`)
    console.log(`Rendu : ${opt.software ? 'logiciel (SwiftShader)' : 'GPU'}${opt.headed ? ', fenêtre visible' : ', sans affichage'} · ${r.frames} images mesurées sur ${fr(r.durationS)} s`)
    console.log(`CPU par image : moyenne ${fr(r.avgMs)} ms · médiane ${fr(r.p50)} · p95 ${fr(r.p95)} · p99 ${fr(r.p99)} · max ${fr(r.max)}`)
    console.log(`Images > 8 ms : ${r.over8ms} · > 16,7 ms (60 fps perdu) : ${r.over16ms}`)
    console.log(`Compilations de shaders pendant la mesure : ${r.compilesDuringRun} · objets affichés (max) : ${r.maxObjects}`)
    if (r.longFrames.length) console.log('Images > 25 ms :', r.longFrames.map((f) => `${fr(f.ms)} ms à ${fr(f.atS)} s`).join(' · '))
    for (const t of topFunctions) console.log(`  ${String(t.part).padStart(5)} %  ${t.fonction}`)
    if (errors.length) console.log('Erreurs de la page :', errors)
}
