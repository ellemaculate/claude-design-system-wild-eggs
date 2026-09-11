// Per-display-element measuring tape. Prints the rendered text width against the width the
// parent cell actually offers, so a size can be chosen by arithmetic instead of by bisection.
// Run build.js first — this reads site/modern.html, the same file verify.js reads.
const { chromium } = require("playwright-core")
const http = require("http"), fs = require("fs"), path = require("path")
const SITE = path.join(__dirname, "site"), PORT = 8861
const MIME = { ".html": "text/html", ".png": "image/png", ".jpg": "image/jpeg" }
const CLASSES = ["dispBig", "dispSub", "couponBig", "panelBig", "quesoWord", "num", "code", "h1", "h2"]
const WIDTHS = (process.argv[2] || "900,620,414,375,320").split(",").map(Number)

const srv = http.createServer((q, r) => {
    const f = path.join(SITE, decodeURIComponent(q.url.split("?")[0]))
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end() }
    r.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" })
    fs.createReadStream(f).pipe(r)
})
srv.listen(PORT, "127.0.0.1", async () => {
    const b = await chromium.launch({
        executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
        args: ["--no-sandbox", "--no-proxy-server", "--hide-scrollbars"],
    })
    for (const w of WIDTHS) {
        const p = await b.newPage({ viewport: { width: w, height: 1000 }, reducedMotion: "reduce" })
        await p.goto(`http://127.0.0.1:${PORT}/modern.html`, { waitUntil: "networkidle" })
        await p.waitForTimeout(400)
        const rows = await p.evaluate((CLASSES) => {
            const out = []
            document.querySelectorAll("[class]").forEach((el) => {
                const cls = [...el.classList].find((c) => CLASSES.includes(c))
                if (!cls) return
                // The longest single WORD is what sets the min-content floor: a line can wrap
                // between words but never inside one, so that word is the real constraint.
                const r = document.createRange()
                let widest = 0, widestText = ""
                const walk = (n) => {
                    if (n.nodeType === 3) {
                        let i = 0
                        for (const m of n.data.matchAll(/\S+/g)) {
                            r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length)
                            const ww = r.getBoundingClientRect().width
                            if (ww > widest) { widest = ww; widestText = m[0] }
                        }
                        void i
                    } else n.childNodes.forEach(walk)
                }
                walk(el)
                const cell = el.closest("td") || el.parentElement
                const cs = getComputedStyle(cell)
                const avail = cell.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
                out.push({
                    cls, fs: parseFloat(getComputedStyle(el).fontSize),
                    word: widestText, wordW: Math.round(widest * 10) / 10,
                    avail: Math.round(avail * 10) / 10,
                })
            })
            return out
        }, CLASSES)
        console.log(`--- ${w}px`)
        for (const r of rows) {
            const slack = Math.round((r.avail - r.wordW) * 10) / 10
            const flag = slack < 0 ? "OVERFLOW" : slack < 6 ? "tight" : "ok"
            console.log(`  ${flag.padEnd(9)} .${r.cls} @${r.fs}px  widest word "${r.word}" ${r.wordW}px  cell offers ${r.avail}px  slack ${slack}px`)
        }
        await p.close()
    }
    await b.close(); srv.close()
})
