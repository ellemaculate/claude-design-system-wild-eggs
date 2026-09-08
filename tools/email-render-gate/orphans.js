// Centred copy that ends on a single short word is the bug Elle photographed: the kit contents
// list left the word "drinks" alone under a full line, and a ragged centre axis made three short
// lines read as three separate thoughts.
//
// A source review cannot catch this. It only exists once type is set at a given measure, in a
// given font, at a given width, and Word breaks lines differently from every browser. So it is a
// RENDER assertion, checked at every width the email actually meets.
//
// Legal blocks are exempt by length: an orphan inside a 60-word terms paragraph is invisible.
const { chromium } = require("playwright-core")
const http = require("http"), fs = require("fs"), path = require("path")
const SITE = path.join(__dirname, "site"), PORT = 8836
const MIME = { ".html": "text/html", ".png": "image/png", ".jpg": "image/jpeg" }
const MIN_LAST_LINE = 0.22   // last line must hold at least 22% of the measure
const LEGAL_CHARS = 260      // paragraphs longer than this are terms; exempt

const fail = [], ok = []
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
    for (const [file, W] of [["word.html",900],["word.html",760],["word.html",700],
                             ["modern.html",600],["modern.html",414],["modern.html",375],["modern.html",320]]) {
        const p = await b.newPage({ viewport: { width: W, height: 1200 }, reducedMotion: "reduce" })
        await p.goto(`http://127.0.0.1:${PORT}/${file}`, { waitUntil: "networkidle" })
        await p.waitForTimeout(500)
        const bad = await p.evaluate(({ MIN_LAST_LINE, LEGAL_CHARS }) => {
            const out = []
            document.querySelectorAll("p, h1, div").forEach((el) => {
                if (el.children.length) return
                const cs = getComputedStyle(el)
                if (cs.textAlign !== "center") return
                const txt = (el.textContent || "").trim()
                if (!txt || txt.length > LEGAL_CHARS) return
                const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4
                if (Math.round(el.getBoundingClientRect().height / lh) < 2) return
                const r = document.createRange(); r.selectNodeContents(el)
                const rects = [...r.getClientRects()]; if (!rects.length) return
                const last = rects[rects.length - 1], full = el.getBoundingClientRect().width
                if (last.width < full * MIN_LAST_LINE)
                    out.push(`"${txt.slice(0, 46)}" ends on a ${Math.round(last.width / full * 100)}% last line`)
            })
            return out
        }, { MIN_LAST_LINE, LEGAL_CHARS })
        const label = `${file} @ ${W}px`
        if (bad.length) bad.forEach((m) => fail.push(`${label}: ${m}`))
        else ok.push(label)
        console.log(`  ${bad.length ? "FAIL" : "PASS"}  ${label}${bad.length ? "  " + bad.join(" | ") : ""}`)
        await p.close()
    }
    await b.close(); srv.close()
    console.log(`  -> ${ok.length} pass, ${fail.length} fail`)
    process.exit(fail.length ? 1 : 0)
})
