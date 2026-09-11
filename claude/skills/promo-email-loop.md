# Promo Email Loop

## RULE ZERO — THE HTML TXT GOES INLINE IN CHAT. ALWAYS. EVERY TIME.

Every reply that delivers or revises an email MUST contain the full final HTML inline in chat, in
one ```html fenced code block, ready to copy straight into Paytronix Source view. Not a file path.
Not an attachment on its own. Not a summary of what changed. Not "the file is at emails/x.html."
Not a partial or an excerpt. The whole file, in the message, in a code block.

This is non-negotiable and it is not conditional on the email being finished. Delivering a draft,
a revision, a one-line copy fix — the HTML TXT ships with it every single time. If a reply about
an email does not contain that code block, the reply is not done, no matter how good the rest of
it is. Attachments and screenshots are ADDITIONAL, never a substitute.

Paste the PASTE build (documentation comments stripped by tools/email-render-gate/strip.js), which
is the artifact that actually goes into Paytronix. Length is never a reason to skip it or to
truncate it. Elle has asked for this repeatedly and every miss costs her a round trip.

---

Produce a paste-ready Paytronix promo email in the CBW/Wild Eggs house design system and voice,
render-verified before the human ever reviews it. Locked 2026-08-14 after eval E1 (CHIP YEAH):
the loop's gates caught 2 ship-blocking bugs that 4 human review cycles had missed.

**Trigger:** any request to create/update a marketing or promo email for either brand.
**Invocation shorthand:** "Run the promo email loop. Brief: …"

## Brief format (INTAKE contract)

One line minimum: `offer item · threshold · code (or "no code") · redemption location · end date · CTA URL · image URLs`.
Example: `free large chip platter · $150+ catering pre-tax · CHIPYEAH at online checkout · thru 8/18 · crazybowlsandwraps.com/catering · [4 image links]`.

INTAKE rules — never invent a fact:
- Missing field → one consolidated question to the human, not a drip.
- "No code" mechanic → the code tag element is REMOVED, never faked.
- Cross-brand: Wild Eggs sends require the WE reference email first; never assume CBW's system.

## The graph

BRIEF → INTAKE → ASSETS → PLAN → BUILD → VERIFY(G1,G2,G3) → REVISE(≤3/gate) → PACKAGE → HUMAN GATE → MEASURE → LEARN

- ASSETS: curl every image, view each one, write alt text from what is actually in it, recommend slots.
- PLAN: map slots to the latest reference send's patterns; subject ×3 + preheader ×2; pun bank ≥8.
- BUILD: start from the latest reference HTML as the literal skeleton; change content, never system
  (tokens, fonts, motion classes, `template:link` tags stay byte-identical).
- REVISE consumes only the failure report; re-run only the failed gate (+G2 if layout touched).
- Escalate to the human after 3 failed cycles on one gate, or 30 min / ~150k tokens.

## Gate G1 — mechanical (grep + curl)

- Offer item, threshold, code, end date each appear ≥2× (code and date ≥3× counting preheader),
  with zero contradictions between preheader / body / terms.
- Terms line includes: threshold + "(pre-tax)", full end date, code + redemption location,
  "One per order. Not stackable with other offers."
- `grep -c 'framer.website'` = 0 in rendered strings (staging-domain leak check).
- Every href curls 200 (follow redirects, 12s timeout). WHITELIST: `rel="preconnect"` origins.
- Every link carries utm_source=paytronix, utm_medium=email, unique utm_campaign per send,
  unique utm_content per slot (primary-cta may appear 2× — MSO + non-MSO fallback).
- `template:link` unsubscribe + campaign_view tags present (6 tag occurrences).

## Gate G2 — visual render (the money gate)

Prep: build render.html — curl every image + the Google Fonts css2 URL (Chrome UA for woff2),
inline all as data: URIs. This keeps TLS intact (curl trusts the proxy CA; the browser runs offline)
and validates every asset URL as a side effect.

Render (Chromium is preinstalled at /opt/pw-browsers/*/chrome-linux/chrome):

    chrome --headless=new --no-sandbox --no-proxy-server --hide-scrollbars \
      --force-prefers-reduced-motion --window-size=600,H --screenshot=d.png file://render.html
    # repeat at --window-size=375,H

`--force-prefers-reduced-motion` is MANDATORY — intro animations start at opacity:0 and a frame-zero
capture produces false "missing element" bugs (learned in E1).

Numeric assertion via playwright-core (npm i playwright-core, executablePath = the chrome above):
`document.scrollingElement.scrollWidth <= viewport` at BOTH 375 and 600. On failure, enumerate
elements with getBoundingClientRect().width > viewport to name the culprit — never guess.

Vision review of both screenshots, 6 points: (1) no clipping, (2) no image distortion/squish,
(3) correct image in correct slot, (4) text contrast, (5) button integrity, (6) all images loaded.

## Gate G2b — the render gate, one command (MANDATORY, replaces ad-hoc capture)

    cd tools/email-render-gate && node check.js ../../emails/<name>.html

Builds six client variants (modern, word, gmail, noimg, nostyle, nocond) and runs, in order:

| stage | catches |
|---|---|
| `verify.js` | overflow, shell width, display collisions, button padding, aspect drift, oversize |
| `upgrade.js` | the `@media screen` display upgrade silently losing to an inline `font-size` |
| `orphans.js` | a centred block ending on a runt last line |
| `lint-word.js` | source rules Chromium cannot see (line-height under 1 on display type, etc.) |
| `strip.js` + `diff.js` | regenerates the PASTE build and proves it renders identically |

Exits non-zero if anything fails. Green is the precondition for delivering — never report a
gate result that was not just run in this session.

**The specificity rule.** The architecture is: Word-safe size INLINE, editorial size in
`@media screen`, because Word never reads a media query. An inline `font-size` beats a class
rule — media query or not — unless the rule carries `!important`, so **every declaration in an
upgrade block must carry `!important`**. Word never reads `@media`, so it cannot reach Outlook
Classic and is safe there. Adding it is not a one-liner: the real rendered size goes up, which
can overflow a cell or collide with a neighbour. Measure with `node measure.js`, which prints
the widest single word against the width the parent cell actually offers, then re-run the gate.

## Gate G3 — voice

- ≥6 distinct puns, placed in the reference rhythm (top bar, sub-line, offer line, captions, panel).
- Food-first rule: tease the person or the logistics, NEVER the plate. The dish is always the hero.
- Banned: emoji confetti, AI-isms (delve, elevate, "in today's fast-paced world").
- ALLOWED: `&mdash;` in email body copy (house reference precedent overrides the general no-em-dash rule).
- No fake numbers anywhere, ever.

## Known house-template fixes (apply to EVERY send built from pre-2026-08-14 references)

1. Stacked colossal headlines: the sub-line `<p class="m-sub">` needs inline `display:block;`
   or it renders BESIDE the word block (both are inline-block; wide single words masked this).
2. Mobile media query: `.stack2 { display:block !important; width:100% !important;
   box-sizing:border-box !important; }` — without border-box, cell padding overflows the
   viewport by ~72px on mobile (latent in QUESO + Thirsty Thursday templates).
3. **The display-type upgrade block needs `!important` on every declaration.** Without it the
   inline Word-safe size wins and modern clients render the small type. This was live in five
   files at once and no geometry assertion could see it, because nothing was broken — it just
   was not the design. `upgrade.js` is the gate; see G2b.
4. `<title>` must carry the preheader copy word for word. One send shipped with `<title></title>`
   and therefore no inbox preview text at all.
5. `.w600 { width:100%!important; max-width:100%!important }` must exist AND be on both the
   wrapper div and the shell table. `max-width:100%` alone cannot shrink a fixed-width table,
   so without the class the email renders 600px wide inside a 375px phone.
6. Never set a fixed `height` plus `object-fit:cover` on a photo. Word ignores `object-fit` and
   obeys `height`, so a portrait in a landscape slot ships stretched. Place at native ratio.

## PACKAGE (always ALL of these — no exceptions)

1. **THE FULL HTML INLINE IN CHAT, in one ```html code block.** See RULE ZERO at the top of this
   file. This is item one because it is the only item Elle actually needs to ship the email, and
   it is the one that keeps getting dropped. Paste the PASTE build. Never truncate it.
2. The verified .html file (attached) — in addition to item 1, never instead of it.
3. Both screenshots (600 + 375) as proof.
4. Subject/preheader picks + send-time recommendation (weekday AM; deadline sends on deadline day).
5. Unresolved questions flagged (e.g., "verify code validates at checkout with a $150 cart").

## HUMAN GATE — always required before execution

Sending (always) · offer terms/legal fine print · the headline pun/campaign name · any image the
human didn't supply · any claim about checkout behavior. STAYS MANUAL: Paytronix paste, test-send,
code validation at checkout, list selection, the send itself.

## MEASURE + LEARN

After the human confirms the send: pull opens→clicks→orders by utm_content (Windsor.ai → GA4).
Every human revision note and every gate finding gets appended to this file's fix list. Track
"human cycles per email" — baseline 4, current 0, target ≤1.

## Eval scorecard (pass = 6/7, * mandatory)

mechanics exact* · links 200 + UTMs unique* · visual clean at both widths* · voice gates pass ·
system-match diff clean · ≤1 human revision cycle · packaging complete (file + inline TXT + screenshots).
