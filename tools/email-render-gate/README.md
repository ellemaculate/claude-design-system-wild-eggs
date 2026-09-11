# Email Render Gate

Render gate for Paytronix HTML emails. Same "render before review" discipline as
`promo-chat-gate`, pointed at an email instead of a React component.

It builds four client variants from one source file, renders each in headless
Chromium at real viewport widths, and asserts **geometry** rather than reading the
source.

## Why it exists

The Family Night template shipped to Outlook Classic with four separate bugs that
every source review missed. The CFO's screenshots caught them in production. None
of them are visible in the markup; all of them are obvious in a bounding box.

## Run

    cd tools/email-render-gate
    npm i --no-audit --no-fund playwright-core
    mkdir -p site
    # drop placeholder images into site/ sized to the real photos, then:
    node build.js ../../emails/<file>.html
    node verify.js

## The six variants

| variant | stands in for |
|---|---|
| `modern.html` | Apple Mail, iOS Mail, Gmail app + web, Outlook.com, Outlook for Mac, Yahoo, Samsung, Thunderbird |
| `word.html` | **Outlook Classic on Windows** (2007-2024 and classic M365) |
| `gmail.html` | Gmail's extra property stripping |
| `noimg.html` | images blocked, the default first-open state in most corporate inboxes |
| `nostyle.html` | clients that drop the `<style>` block entirely |
| `nocond.html` | clients that discard conditional comments |

## The Word transform

Outlook Classic renders with the **Word** engine. `build.js` applies its documented
behaviours in order:

1. `@media` blocks are never read → every `@media` block is stripped
2. `<!--[if mso]>` content **is** read → unwrapped into live markup
3. no webfonts → the Google Fonts link is removed and the first family in each
   stack is forced to resolve to a serif, modelling Windows font substitution
4. no `display:inline-block` → stripped
5. no padding on inline elements → `padding` stripped from every `<a>` style
6. no `border-radius`, `object-fit`, `max-width`, or CSS animation

Sources: caniemail.com per-property Outlook Windows data, and Microsoft's Word
HTML rendering guidance for Outlook 2007+.

## What it asserts

- **no horizontal overflow** at 320 / 360 / 375 / 414 / 600 / 900
- **the shell stays at 600px** — Word blew it to ~870px on the last send
- **display type never collides with its neighbours** — the load-bearing one.
  `line-height` below 1 makes Word clip the line box while the glyphs keep full
  height, so caps bleed upward into whatever sits above. This is what put
  "UNDEFEATED." through the Family Night bar. A source review cannot see it; a
  bounding-box gap test can.
- **every CTA keeps its padding** — the cell must be at least 12px taller than its
  text, and at least 40px for a tap target. Catches padding declared on the anchor,
  which Word silently drops.
- **images keep their native aspect ratio** — Word ignores `object-fit` but obeys
  `height`, so a fixed height on a differently-shaped photo squashes it.
- no JS errors, on every variant.

## The min-content trap

Any **fixed length** on a nested element becomes a min-content floor for the entire
email, and no amount of `width:100% !important` on the outer shell can release it.
Two instances were pinning this template:

- `max-width:600px` on a full-bleed image → 600px floor
- `width:594px` on the two-column panel's table → 600px floor
- `width:360px` on the ribbon → the long-unexplained ~340-360px floor that made
  every send on this template scroll sideways at 320px

Percentage lengths contribute zero. Use `max-width:100%` on images, and release any
fixed-width nested table inside the mobile media query.

## The specificity gate — `upgrade.js`

    node upgrade.js ../../emails/<file>.html

The Word-safe architecture puts the **small** size inline and scales **up** inside
`@media screen`, because Word never reads a media query. That only works if the
class rule actually wins. It usually does not:

> An inline `font-size` beats a class rule in a stylesheet, media query or not,
> unless the rule carries `!important`.

Without it the upgrade silently loses and every modern client renders the small
Word-safe size — the email still passes every geometry assertion, because nothing
is broken, it is just wrong everywhere. `upgrade.js` renders the modern build at
900px and asserts the computed size is **strictly larger** than the inline value
for every display class that declares an upgrade.

The fix is never a blind `!important` add. Letting the upgrade through raises the
real rendered size, which can then overflow its cell: this template needed
140px → 124px at the same time, because "QUESO." measures 553px inside a 520px
cell at 140px. Re-measure after adding it.

## The orphan gate — `orphans.js`

    node orphans.js ../../emails/<file>.html

Measures the last rendered line of every centred block at seven widths in both
engines and fails a last line under 22% of the measure. A one-word last line is
only visible at render time; it is invisible in the source, and it moves when the
copy around it changes. Legal paragraphs over 260 characters are exempt.

## Adding an assertion

Add to `OVERLAP_PAIRS` for a new pair that must never touch, or extend the `geom()`
evaluate block. Assert geometry, never source text.

## What this gate cannot do

There is no Word engine on Linux. `word.html` is a **simulation** built from the
documented behaviour list, not a real Outlook render, and `Impact` is not installed
here so the display fallback renders as Arial. It reliably catches layout collapse,
collisions, and overflow. It does not replace a Litmus or Email on Acid run before a
large send, and it cannot confirm exact Windows font metrics.

## Two files per email

`<name>.html` is the working master. It carries the documentation comments that
explain why each Outlook fix and each copy rule exists, so the next person to
edit it does not reintroduce a bug that already cost a send.

`<name>.PASTE.html` is what actually goes into Paytronix. It is the same file
with the documentation comments removed and nothing else changed.

**The `<!--[if mso]>` blocks are not notes.** They are functional markup that the
Word engine reads: the stylesheet that fixes the headline overlap and the serif
fallback, and the ghost table that centres the shell. Stripping them breaks
Outlook Classic. The strip keeps them, and the integrity check asserts all three
survive.

Regenerate the paste file after any edit to the master, then prove they are the
same email:

    node build.js ../../emails/<name>.html      && node diff.js master
    node build.js ../../emails/<name>.PASTE.html && node diff.js paste

`diff.js` captures with `reducedMotion: "reduce"`. The motion layer contains an
infinite keyframe, so without freezing it every capture differs and the
comparison is meaningless.
