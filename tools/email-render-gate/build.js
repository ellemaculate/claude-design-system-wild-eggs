// Produce the client variants we test against, from the one source file.
//
//   modern.html  - what a browser-engine client sees (Apple Mail, iOS Mail, Gmail
//                  app/web, Outlook.com, Outlook for Mac, Yahoo, Samsung, Thunderbird).
//   word.html    - what OUTLOOK CLASSIC on Windows sees. Word engine, not a browser.
//   gmail.html   - Gmail's extra restrictions on top of modern.
//   noimg.html   - images blocked, which is the default state for a large share of
//                  Outlook and corporate inboxes on first open.
//
// The Word transform is the important one. It applies, in order, the documented
// Word-engine behaviours that caused the failures photographed in the last send:
//
//   1. @media blocks are never read           -> strip every @media block
//   2. conditional <!--[if mso]> content IS read -> unwrap it into live markup
//   3. no webfonts                             -> drop the Google Fonts <link>
//   4. no display:inline-block                 -> strip that declaration
//   5. no padding on inline elements (<a>)     -> strip padding from anchors
//   6. no border-radius / object-fit / max-width
//
// Sources for the behaviour list: caniemail.com per-property Outlook Windows data,
// and Microsoft's own "Word HTML rendering" guidance for Outlook 2007+.

const fs = require("fs")
const path = require("path")

const SRC = process.argv[2] || "/tmp/tk/taco-kit-draft-day.html"
const OUT = path.join(__dirname, "site")
let src = fs.readFileSync(SRC, "utf8")

// Point the REPLACE-ME tokens at local placeholders sized to the real photos.
function withImages(h) {
    return h
        .replace(/https:\/\/paytronix-bee[^"']*Queso%20CBW\.png/g, "queso_cbw.png")
        .replace(/https:\/\/paytronix-bee[^"']*Draft%20Day_CBW\.png/g, "draftday_cbw.png")
        .replace(/https:\/\/paytronix-bee[^"']*opt_Queso_hero\.jpg/g, "opt_Queso_hero.jpg")
        .replace(/https:\/\/paytronix-bee[^"']*opt_Queso_panel\.jpg/g, "opt_Queso_panel.jpg")
        .replace(/https:\/\/paytronix-bee[^"']*opt_TacoKit_1_hero\.jpg/g, "opt_TacoKit_1_hero.jpg")
        .replace(/https:\/\/paytronix-bee[^"']*opt_TacoKit_2_Football\.jpg/g, "opt_TacoKit_2_Football.jpg")
        .replace(/https:\/\/paytronix-bee[^"']*opt_TacoKit_3_protein\.jpg/g, "opt_TacoKit_3_protein.jpg")
        .replace(/https:\/\/paytronix-bee[^"']*Logo[^"']*/g, "logo.png")
        // Wild Eggs (Mailjet CDN). Mapped by asset UUID to local files of the real dimensions,
        // so the geometry assertions measure the same pixels the send will.
        .replace(/https:\/\/0nlz6\.mjt\.lu[^"']*adb58b99[^"']*/g, "we_logo.png")
        .replace(/https:\/\/0nlz6\.mjt\.lu[^"']*5b86d0f2[^"']*/g, "we_hero.jpg")
        .replace(/https:\/\/0nlz6\.mjt\.lu[^"']*bba95e85[^"']*/g, "we_chip1.jpg")
        .replace(/https:\/\/0nlz6\.mjt\.lu[^"']*726854ad[^"']*/g, "we_chip2.jpg")
        .replace(/https:\/\/0nlz6\.mjt\.lu[^"']*6e339e92[^"']*/g, "we_portrait.jpg")
        .replace(/https:\/\/0nlz6\.mjt\.lu[^"']*9e1693d1[^"']*/g, "we_waffle.jpg")
        .replace(/https:\/\/0nlz6\.mjt\.lu[^"']*c53fde98[^"']*/g, "we_fb.png")
        .replace(/https:\/\/0nlz6\.mjt\.lu[^"']*605da7fb[^"']*/g, "we_ig.png")
        .replace(/https:\/\/paytronix-bee[^"']*ribbon[^"']*/gi, "ribbon.png")
}

// ---- strip balanced @media blocks (regex cannot count braces; do it by hand) ----
function stripAtMedia(css) {
    let out = ""
    let i = 0
    while (i < css.length) {
        const at = css.indexOf("@media", i)
        if (at === -1) {
            out += css.slice(i)
            break
        }
        out += css.slice(i, at)
        let j = css.indexOf("{", at)
        if (j === -1) break
        let depth = 1
        j++
        while (j < css.length && depth > 0) {
            if (css[j] === "{") depth++
            else if (css[j] === "}") depth--
            j++
        }
        i = j
    }
    return out
}

// ---------------- MODERN ----------------
let modern = withImages(src)
// conditional comments are inert in every browser engine; leave them as comments.
fs.writeFileSync(path.join(OUT, "modern.html"), modern)

// ---------------- GMAIL ----------------
// Gmail supports <style> in head and media queries, but strips position, and
// historically drops properties it does not recognise rather than the whole rule.
let gmail = modern.replace(/position\s*:\s*(absolute|fixed|relative)\s*;?/gi, "")
fs.writeFileSync(path.join(OUT, "gmail.html"), gmail)

// ---------------- NO IMAGES ----------------
let noimg = modern.replace(/src="[^"]*\.(png|jpg)"/g, 'src="missing-on-purpose.png"')
fs.writeFileSync(path.join(OUT, "noimg.html"), noimg)

// ---------------- WORD / OUTLOOK CLASSIC ----------------
let word = modern

// 2. Word DOES read conditional comments. Unwrap them so the simulation sees
//    exactly what Word sees: the mso stylesheet and the ghost table.
word = word.replace(/<!--\[if mso\]>([\s\S]*?)<!\[endif\]-->/g, "$1")
word = word.replace(/<!--\[if mso \| IE\]>([\s\S]*?)<!\[endif\]-->/g, "$1")

// 3. No webfonts.
word = word.replace(/<link[^>]*fonts\.googleapis[^>]*>/g, "")
word = word.replace(/<link[^>]*fonts\.gstatic[^>]*>/g, "")
word = word.replace(/<link[^>]*preconnect[^>]*>/g, "")

// 1. No media queries. Do this AFTER unwrapping mso so we do not touch that block.
word = word.replace(/<style([^>]*)>([\s\S]*?)<\/style>/g, (m, attrs, css) => {
    return "<style" + attrs + ">" + stripAtMedia(css) + "</style>"
})

// 4. display:inline-block is not supported. Word treats it as block.
word = word.replace(/display\s*:\s*inline-block\s*;?/gi, "")

// 5. Padding is not applied to inline elements. Strip it from every anchor's
//    inline style. This is what collapsed the buttons in the real screenshots.
word = word.replace(/<a\b([^>]*)style="([^"]*)"/gi, (m, pre, style) => {
    const stripped = style.replace(/(^|;)\s*padding[^;]*/gi, "$1")
    return "<a" + pre + 'style="' + stripped + '"'
})

// 6. Unsupported box properties.
word = word.replace(/border-radius\s*:[^;"]*;?/gi, "")
word = word.replace(/object-fit\s*:[^;"]*;?/gi, "")
word = word.replace(/max-width\s*:[^;"]*;?/gi, "")
// Word also ignores CSS animations entirely.
word = word.replace(/animation\s*:[^;"]*;?/gi, "")

// Force the Word font situation: no Passion One, no Bricolage, no Fraunces on a
// Windows box. Windows font substitution maps an unknown first-choice family
// through its own table rather than walking the CSS fallback list, and in the
// real screenshots that produced a SERIF. Model that worst case explicitly.
word = word.replace(/'Passion One'/g, "'__MissingDisplay'")
word = word.replace(/'Bricolage Grotesque'/g, "'__MissingBody'")
word = word.replace(/'Fraunces'/g, "'__MissingSerif'")
word = word.replace(/Fraunces,/g, "'__MissingSerif',")
word =
    word.replace(
        "</head>",
        `<style>
  /* Windows substitution worst case: an unresolvable first family lands on a serif. */
  @font-face { font-family:'__MissingDisplay'; src:local('Times New Roman'); }
  @font-face { font-family:'__MissingBody';    src:local('Times New Roman'); }
  @font-face { font-family:'__MissingSerif';   src:local('Times New Roman'); }
</style></head>`
    )

fs.writeFileSync(path.join(OUT, "word.html"), word)

// ---------------- STYLESHEET STRIPPED ----------------
// The failure that actually shipped. Somewhere between the paste into Paytronix and
// Outlook Classic, the <style> block and/or the conditional comment stopped taking
// effect, and the email fell back to its INLINE styles. Previously that meant an 84px
// headline at line-height 0.88, which crashed into the chip above it.
// This variant keeps ONLY what can never be stripped: the inline attributes. If the
// email is still intact here, it is intact everywhere.
let nostyle = modern
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<!--\[if mso[\s\S]*?<!\[endif\]-->/g, "")
    .replace(/<link[^>]*fonts\.googleapis[^>]*>/g, "")
    .replace(/<link[^>]*preconnect[^>]*>/g, "")
fs.writeFileSync(path.join(OUT, "nostyle.html"), nostyle)

// ---------------- CONDITIONAL COMMENTS STRIPPED ----------------
// Paytronix has stripped comments on a paste before, on the Wild Eggs side. This keeps
// the stylesheets but removes every <!--[if mso]--> block, which is what a
// comment-stripping paste produces.
let nocond = modern.replace(/<!--\[if mso[\s\S]*?<!\[endif\]-->/g, "")
fs.writeFileSync(path.join(OUT, "nocond.html"), nocond)

console.log("built: modern.html  gmail.html  noimg.html  word.html  nostyle.html  nocond.html")
