// Render gate for the Taco Kit "Draft Day" email.
//
// Renders every client variant in headless Chromium and asserts geometry rather
// than reading the source. The overlap assertions exist because the previous send
// shipped with line-height below 1 on display type: Outlook Classic clipped the
// line box, the glyphs kept full height, and the headline crashed up through the
// bar above it. Nothing in a source review catches that. A bounding-box collision
// test does.

const { chromium } = require("playwright-core")
const http = require("http")
const fs = require("fs")
const path = require("path")

const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
const SITE = path.join(__dirname, "site")
const PORT = 8744
const BASE = "http://127.0.0.1:" + PORT

const fail = []
const ok = []
function check(cond, msg) {
    ;(cond ? ok : fail).push(msg)
    console.log((cond ? "  PASS  " : "  FAIL  ") + msg)
}

const MIME = { ".html": "text/html", ".png": "image/png", ".css": "text/css" }
function serve() {
    return new Promise((res) => {
        const s = http.createServer((req, rq) => {
            const f = path.join(SITE, decodeURIComponent(req.url.split("?")[0]))
            if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) {
                rq.writeHead(404)
                return rq.end("nope")
            }
            rq.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" })
            fs.createReadStream(f).pipe(rq)
        })
        s.listen(PORT, "127.0.0.1", () => res(s))
    })
}

// Every pair of elements that must never touch. These are the exact collisions
// photographed in Outlook Classic on the previous send.
const OVERLAP_PAIRS = [
    // Crazy Bowls & Wraps
    ["the chip bar", ".m-chip", "the hero headline", ".dispBig"],
    ["the hero headline", ".dispBig", "the hero subhead", ".dispSub"],
    ["the colossal word", ".quesoWord", "its subhead", ".quesoSub"],
    // Wild Eggs: the offer figure and the code card below it, and the quote mark
    // against the testimonial copy it sits on top of.
    ["the offer figure", ".num", "the code card", ".code"],
    ["the quote mark", ".quotemark", "the testimonial", ".quotecopy"],
]

async function geom(page) {
    return page.evaluate(() => {
        const r = (el) => {
            const b = el.getBoundingClientRect()
            return { t: b.top, l: b.left, r: b.right, b: b.bottom, w: b.width, h: b.height }
        }
        const out = {
            scrollW: document.scrollingElement.scrollWidth,
            docW: document.documentElement.clientWidth,
            shell: null,
            pairs: {},
            buttons: [],
            eyebrowPairs: [],
            imgs: [],
        }
        const shell = document.querySelector("table.w600")
        if (shell) out.shell = r(shell)

        for (const sel of [".m-chip", ".dispBig", ".dispSub", ".quesoWord", ".quesoSub",
                           ".num", ".code", ".h1", ".h2", ".quotemark", ".quotecopy"]) {
            const el = document.querySelector(sel)
            if (el) out.pairs[sel] = r(el)
        }

        // Every CTA: the clickable cell must be a real button, not collapsed text.
        document.querySelectorAll("td[bgcolor] > a[href]").forEach((a) => {
            // Full-bleed photo links live in coloured cells too but are not buttons.
            if (a.querySelector("img")) return
            const cell = a.parentElement
            out.buttons.push({
                text: a.innerText.trim().slice(0, 30),
                cellH: Math.round(cell.getBoundingClientRect().height),
                cellW: Math.round(cell.getBoundingClientRect().width),
                textH: Math.round(a.getBoundingClientRect().height),
            })
        })

        // Step numerals and headcount figures must clear their own labels too.
        document.querySelectorAll('.stepNum').forEach((n) => {
            const nx = n.nextElementSibling
            const pv = n.previousElementSibling
            if (nx) out.eyebrowPairs.push({
                head: "stepNum " + n.innerText.trim().slice(0, 8),
                eyebrowBottom: pv ? pv.getBoundingClientRect().bottom : n.getBoundingClientRect().top,
                headTop: n.getBoundingClientRect().top,
                headBottom: n.getBoundingClientRect().bottom,
                nextTop: nx.getBoundingClientRect().top,
            })
        })

        // Panel eyebrow -> panel headline collisions.
        document.querySelectorAll(".panelBig").forEach((h) => {
            const prev = h.previousElementSibling
            if (prev) {
                out.eyebrowPairs.push({
                    head: h.innerText.trim().slice(0, 28),
                    eyebrowBottom: prev.getBoundingClientRect().bottom,
                    headTop: h.getBoundingClientRect().top,
                    headBottom: h.getBoundingClientRect().bottom,
                    nextTop: h.nextElementSibling
                        ? h.nextElementSibling.getBoundingClientRect().top
                        : null,
                })
            }
        })

        document.querySelectorAll("img").forEach((im) => {
            const b = im.getBoundingClientRect()
            out.imgs.push({
                src: im.getAttribute("src"),
                w: Math.round(b.width),
                h: Math.round(b.height),
                natW: im.naturalWidth,
                natH: im.naturalHeight,
            })
        })
        return out
    })
}

async function run(label, file, width, height, opts = {}) {
    console.log(`\n=== ${label} — ${file} @ ${width}x${height} ===`)
    const browser = await chromium.launch({
        executablePath: EXE,
        args: ["--no-sandbox", "--no-proxy-server", "--hide-scrollbars"],
    })
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
    const errs = []
    page.on("pageerror", (e) => errs.push("PAGEERROR " + e.message))
    await page.goto(`${BASE}/${file}`, { waitUntil: "networkidle" })
    await page.waitForTimeout(900)

    const g = await geom(page)

    // ---- 1. horizontal overflow ----
    check(
        g.scrollW <= width + 1,
        `no horizontal overflow (scrollWidth ${g.scrollW} <= ${width})`
    )

    // ---- 2. shell width. Word blew this to ~870px last time. ----
    if (g.shell && width >= 700) {
        check(
            g.shell.w <= 612,
            `shell stays at 600px (measured ${Math.round(g.shell.w)}px, cap 612)`
        )
    }

    // ---- 3. display type must not collide with its neighbours ----
    for (const [aName, aSel, bName, bSel] of OVERLAP_PAIRS) {
        const A = g.pairs[aSel]
        const B = g.pairs[bSel]
        if (A && B) {
            const gap = B.t - A.b
            check(
                gap >= -1,
                `${bName} does not crash into ${aName} (gap ${Math.round(gap)}px)`
            )
        }
    }

    // ---- 4. panel headlines must not collide with their eyebrows ----
    for (const p of g.eyebrowPairs) {
        const gap = p.headTop - p.eyebrowBottom
        check(gap >= -1, `"${p.head}" clears its eyebrow line (gap ${Math.round(gap)}px)`)
        if (p.nextTop !== null) {
            const gap2 = p.nextTop - p.headBottom
            check(
                gap2 >= -1,
                `"${p.head}" does not overlap the copy below it (gap ${Math.round(gap2)}px)`
            )
        }
    }

    // ---- 5. every CTA is a real button, not collapsed text ----
    for (const b of g.buttons) {
        check(
            b.cellH >= b.textH + 12,
            `button "${b.text}" keeps its padding (cell ${b.cellH}px vs text ${b.textH}px)`
        )
        check(b.cellH >= 40, `button "${b.text}" is tap-sized (${b.cellH}px >= 40)`)
    }

    // ---- 6. display type stays inside a sane size even with no stylesheet ----
    // Guards the fail-safe direction: the INLINE value must be one that cannot overlap.
    if (opts.inlineOnly) {
        const hero = g.pairs[".dispBig"] || g.pairs[".quesoWord"] || g.pairs[".num"]
        if (hero) {
            check(
                hero.h <= 120,
                `headline stays a sane height with no stylesheet (${Math.round(hero.h)}px <= 120)`
            )
        }
    }

    // ---- 7. images keep their aspect ratio (Word ignores object-fit) ----
    if (!opts.skipAspect) {
        for (const im of g.imgs) {
            if (!im.natW || !im.w) continue
            if (/logo|ribbon|missing|we_fb|we_ig/.test(im.src)) continue
            const natRatio = im.natW / im.natH
            const renderRatio = im.w / im.h
            const drift = Math.abs(natRatio - renderRatio) / natRatio
            check(
                drift < 0.06,
                `${im.src} is not distorted (native ${natRatio.toFixed(2)} vs rendered ${renderRatio.toFixed(2)})`
            )
            // Oversized uploads are invisible in every preview and only cost the guest
            // mobile data. 2x is right for retina; past 3x it is pure waste. The protein
            // photo shipped at 5.9x its slot before this check existed.
            if (width >= 700) {
                const over = im.natW / im.w
                check(
                    over <= 3.05,
                    `${im.src} is not oversized (${im.natW}px natural into a ${im.w}px slot, ${over.toFixed(1)}x)`
                )
            }
        }
    }

    check(errs.length === 0, "no JS errors" + (errs.length ? " — " + errs.join(" | ") : ""))

    await page.screenshot({ path: path.join(__dirname, `shot-${label}.png`), fullPage: true })
    await browser.close()
    return g
}

;(async () => {
    const server = await serve()

    // --- Browser-engine clients: Apple Mail, iOS Mail, Gmail app + web,
    //     Outlook.com, Outlook for Mac, Yahoo, Samsung, Thunderbird ---
    await run("modern-900", "modern.html", 900, 1200)
    await run("modern-600", "modern.html", 600, 1200, { skipAspect: true })
    await run("modern-414", "modern.html", 414, 900, { skipAspect: true })
    await run("modern-375", "modern.html", 375, 900, { skipAspect: true })
    await run("modern-360", "modern.html", 360, 900, { skipAspect: true })
    // The stacked-mobile photo intentionally uses object-fit, so aspect drift is
    // expected and correct there.
    await run("modern-320", "modern.html", 320, 900, { skipAspect: true })

    await run("gmail-900", "gmail.html", 900, 1200)
    await run("gmail-375", "gmail.html", 375, 900, { skipAspect: true })

    // --- OUTLOOK CLASSIC (Word engine) ---
    // Outlook's reading pane on a maximised window is roughly 900px wide.
    await run("word-900", "word.html", 900, 1200)
    await run("word-700", "word.html", 700, 1200)

    // --- images blocked ---
    await run("noimg-900", "noimg.html", 900, 1200)

    // --- THE FAILURE THAT SHIPPED ---
    // No stylesheet at all: only inline attributes survive. Mobile stacking and the
    // media queries are gone by definition, so aspect drift is expected; what must hold
    // is that nothing overlaps and every button keeps its padding.
    await run("nostyle-900", "nostyle.html", 900, 1200, { skipAspect: true, inlineOnly: true })
    await run("nostyle-600", "nostyle.html", 600, 1200, { skipAspect: true, inlineOnly: true })

    // Conditional comments stripped, stylesheets intact: what a comment-stripping paste
    // into Paytronix produces.
    await run("nocond-900", "nocond.html", 900, 1200, { skipAspect: true })
    await run("nocond-375", "nocond.html", 375, 900, { skipAspect: true })

    server.close()
    console.log("\n---------------------------------------------")
    console.log(`PASSED: ${ok.length}   FAILED: ${fail.length}`)
    if (fail.length) {
        fail.forEach((f) => console.log("  x " + f))
        process.exit(1)
    }
})()
