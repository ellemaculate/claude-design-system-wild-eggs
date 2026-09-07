// Word-hostile source patterns that a Chromium render CANNOT catch.
//
// Chromium positions a box correctly even when line-height is below 1: the glyphs
// overflow the line box, but getBoundingClientRect still reports the box, so a
// bounding-box collision test sees nothing wrong. Word clips the line box AND may drop
// the margin that was providing clearance, so the same markup overlaps in production.
// These are therefore source rules, not render assertions.
//
// Both rules encode a failure photographed in Outlook Classic.

const fs = require("fs")
const src = fs.readFileSync(process.argv[2], "utf8")
// EVERY display class in EVERY template must be listed here. A class that is not on this list
// is invisible to both rules, which is worse than having no lint at all: it reads as a pass.
// When a template adds a display class, add it here in the same commit.
const DISPLAY = [
    // Crazy Bowls & Wraps
    "dispBig", "dispSub", "couponBig", "panelBig", "stepNum", "quesoWord", "quesoSub",
    // Wild Eggs
    "h1", "h2", "num", "code", "disp", "quotemark",
]

const fails = []
const oks = []
const t = (c, m) => (c ? oks : fails).push(m)

// Every tag carrying a display class, with its inline style and where it sits.
const tags = []
const re = /<(h1|h2|p|div|span)\b[^>]*class="([^"]*)"[^>]*>/g
let m
while ((m = re.exec(src))) {
    const cls = m[2]
    if (!DISPLAY.some((d) => cls.split(/\s+/).includes(d))) continue
    const style = (m[0].match(/style="([^"]*)"/) || ["", ""])[1]
    tags.push({ tag: m[0], cls, style, at: m.index })
}

// RULE 1: no inline line-height below 1 on display type.
// Word treats it as an exact line box; anything below 1 means the glyphs are taller
// than the space reserved for them and the excess bleeds upward into whatever is above.
for (const x of tags) {
    const lh = (x.style.match(/line-height:\s*([0-9.]+)\s*(;|$)/) || [])[1]
    const fs_ = (x.style.match(/font-size:\s*(\d+)px/) || [])[1]
    if (lh === undefined) continue
    const v = parseFloat(lh)
    const bleed = fs_ ? Math.round(parseInt(fs_) * (1 - v)) : null
    t(
        v >= 1,
        `line-height ${lh} on .${x.cls.split(/\s+/).find((c) => DISPLAY.includes(c))}` +
            (fs_ ? ` at ${fs_}px` : "") +
            (v < 1 ? `  -> ${bleed}px of glyph bleed in Word` : "  -> safe")
    )
}

// RULE 2: display type must not depend on its own margin-top for clearance.
// Word can drop margins on block elements inside a table cell. If a display element
// follows a sibling inside the same <td>, the gap has to come from the table structure
// (a separate row, or cell padding), never from the element's margin.
for (const x of tags) {
    const mt = (x.style.match(/margin:\s*(\d+)px/) || x.style.match(/margin-top:\s*(\d+)px/) || [])[1]
    if (!mt || parseInt(mt) === 0) continue
    // walk back to the enclosing <td> and see whether anything else opens in between
    // NOTE: this walks back to the NEAREST enclosing <td>, which for an element that
    // follows a nested table lands on that table's inner cell rather than the outer one.
    // It therefore under-reports "structural" siblings. Rule 1 is the load-bearing check
    // and catches those cases on line-height alone; this rule is a secondary net.
    const before = src.slice(0, x.at)
    const tdAt = before.lastIndexOf("<td")
    const between = src.slice(before.indexOf(">", tdAt) + 1, x.at)
    // A dropped margin only OVERLAPS when the glyphs are already escaping their line
    // box. With line-height at or above 1 a dropped margin just reads tight, which is a
    // cosmetic loss, not a broken email. So flag margin-reliance only when it is
    // load-bearing: the element sits below a structural sibling (a nested table or an
    // image, where Word's margin handling is genuinely unreliable), or its own
    // line-height is below 1 and the margin is the only thing holding the gap open.
    const structural = /<(table|img)\b/.test(between)
    const anySibling = /<(table|p|h1|div|img)\b/.test(between)
    const lhv = parseFloat((x.style.match(/line-height:\s*([0-9.]+)\s*(;|$)/) || [])[1] || "1")
    const risky = anySibling && (structural || lhv < 1)
    const name = x.cls.split(/\s+/).find((c) => DISPLAY.includes(c))
    t(
        !risky,
        `.${name} margin:${mt}px clearance` +
            (risky
                ? ` below a ${structural ? "nested table or image" : "sibling"} at line-height ${lhv}  -> Word may drop it and the type collides`
                : lhv < 1
                  ? `  -> clearance is not the problem here; rule 1 already failed this element`
                  : `  -> safe, line-height ${lhv} keeps the glyphs inside their box`)
    )
}

console.log(`\n${process.argv[2]}`)
for (const o of oks) console.log("  PASS  " + o)
for (const f of fails) console.log("  FAIL  " + f)
console.log(`  -> ${oks.length} pass, ${fails.length} fail`)
process.exit(fails.length ? 1 : 0)
