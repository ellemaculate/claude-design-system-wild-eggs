// Does the @media screen display-type upgrade actually WIN?
//
// The pattern these templates use is: put the Word-safe size INLINE, and put the intended
// editorial size in an @media screen rule. That direction is correct and deliberate — Word
// never reads @media, so it keeps the safe value and nothing depends on a conditional comment.
//
// But an INLINE font-size beats a class rule in a stylesheet, media query or not, unless the
// rule is !important. Without it the upgrade silently loses and every modern client renders
// the small Word-safe size. Nothing looks broken. It just is not the design.
//
// So: render at desktop, read the COMPUTED font-size off each display element, and compare it
// to the inline value in the source. Computed must be strictly larger.
const { chromium } = require("playwright-core")
const http = require("http"), fs = require("fs"), path = require("path")
const SITE = path.join(__dirname, "site"), PORT = 8853
const MIME = { ".html": "text/html", ".png": "image/png", ".jpg": "image/jpeg" }
const CLASSES = ["dispBig", "dispSub", "couponBig", "panelBig", "quesoWord", "num", "code"]

// Only assert on a class that ACTUALLY DECLARES an upgrade inside @media screen. A display
// class with no upgrade rule is a deliberate choice (some type is the same size everywhere),
// not a specificity failure, and flagging it would train people to ignore this gate.
const src = fs.readFileSync(process.argv[2] || path.join(SITE, "modern.html"), "utf8")
const screenBlock = (() => {
    const at = src.indexOf("@media screen")
    if (at === -1) return ""
    let i = src.indexOf("{", at) + 1, depth = 1
    while (i < src.length && depth > 0) {
        if (src[i] === "{") depth++
        else if (src[i] === "}") depth--
        i++
    }
    return src.slice(at, i)
})()
const hasUpgrade = (cls) =>
    new RegExp("\\." + cls + "\\s*(,[^{]*)?\\{[^}]*font-size", "m").test(screenBlock)

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
    const p = await b.newPage({ viewport: { width: 900, height: 1000 } })
    await p.goto(`http://127.0.0.1:${PORT}/modern.html`, { waitUntil: "networkidle" })
    await p.waitForTimeout(500)
    const rows = await p.evaluate((CLASSES) => {
        const out = []
        document.querySelectorAll("[class]").forEach((el) => {
            const cls = [...el.classList].find((c) => CLASSES.includes(c))
            if (!cls) return
            const inlineFs = (el.getAttribute("style") || "").match(/font-size:\s*(\d+(?:\.\d+)?)px/)
            if (!inlineFs) return
            out.push({ cls, inline: parseFloat(inlineFs[1]), computed: parseFloat(getComputedStyle(el).fontSize) })
        })
        return out
    }, CLASSES)
    // One row per class is enough; repeats of the same class carry the same rule.
    const seen = new Set()
    for (const r of rows) {
        if (seen.has(r.cls)) continue
        seen.add(r.cls)
        if (!hasUpgrade(r.cls)) {
            console.log(`  SKIP  .${r.cls}: no @media screen upgrade declared, same size everywhere`)
            continue
        }
        const won = r.computed > r.inline + 0.5
        const msg = `.${r.cls}: inline ${r.inline}px, desktop renders ${r.computed}px` +
            (won ? "  -> upgrade wins" : "  -> UPGRADE LOST, the inline value is what ships")
        ;(won ? ok : fail).push(msg)
        console.log(`  ${won ? "PASS" : "FAIL"}  ${msg}`)
    }
    await b.close(); srv.close()
    console.log(`  -> ${ok.length} pass, ${fail.length} fail`)
    process.exit(fail.length ? 1 : 0)
})
