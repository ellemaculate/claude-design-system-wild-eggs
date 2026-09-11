# Working agreements for this repo

## Emails: the HTML TXT goes inline in chat. Always. Every time.

Any reply that delivers or revises an email MUST include the full final HTML inline in the chat
message, in one ```html fenced code block, ready to copy straight into Paytronix Source view.

- Not a file path. Not an attachment alone. Not a summary of what changed. Not an excerpt.
- The whole file, in the message, in a code block.
- Attachments and screenshots are ADDITIONAL, never a substitute.
- Length is never a reason to skip it or truncate it.
- Paste the `.PASTE.html` build (documentation comments stripped by
  `tools/email-render-gate/strip.js`), because that is what actually goes into Paytronix.

This applies to drafts, revisions and one-line copy fixes equally, not only to finished sends.
If a reply about an email does not contain that code block, the reply is not done.

Full detail: `claude/skills/promo-email-loop.md`, RULE ZERO.

## Emails: run the gate before delivering. One command, no exceptions.

    cd tools/email-render-gate && node check.js ../../emails/<name>.html

`check.js` builds the six client variants and runs every gate in order — geometry, specificity,
orphans, source lint — then regenerates the `.PASTE.html` build and proves master and paste
render identically. It exits non-zero if anything fails.

- Run it on the MASTER file. The paste build is generated, never hand-edited.
- Green is the precondition for delivering. If it fails, the email is not ready — say so.
- Never report a gate result you did not just run. "It passed last time" is not a pass.

Four finished sends shipped with the display-type upgrade silently losing, because each gate
was run once on the day it was written and never again. One command exists so that cannot
happen twice.

## Emails: display type — the `@media screen` upgrade needs `!important`

The Word-safe architecture puts the SMALL size inline and scales UP inside `@media screen`,
because Word never reads a media query. That only works if the class rule wins, and **an inline
`font-size` beats a class rule — media query or not — unless the rule carries `!important`.**

- Every declaration in a display-type upgrade block carries `!important`.
- Word never reads `@media`, so `!important` in there cannot reach Outlook Classic. It is safe.
- Adding it is not a one-line fix: letting the upgrade through raises the REAL rendered size,
  which can then overflow its cell or collide with its neighbour. Re-measure with
  `node measure.js` and re-run the gate. Thursday needed `line-height` 0.92 → 1 the moment the
  upgrade started winning.

## Emails: the preheader matches the `<title>` tag word for word

Paytronix takes inbox preview text from `<title>`. It must carry the PREHEADER COPY, identical to
the hidden preheader div, never a page-title string — Paytronix can surface `<title>` as visible
copy at the top of the email, where a page title reads as a mistake.

## Don't edit a send that is already finished

A new campaign is a NEW file. When the ask is "a new email for X," build a net-new file rather
than modifying a send that has been signed off. If a finished file needs changing, say so and
ask first.

## Don't re-caveat a standing offer

When an offer is carried over from a previous send, carry it verbatim: same threshold, same code,
same terms, same channels. Do not rescope it, do not add hedges about whether it applies, do not
re-derive its fine print. Elle owns the offer; the email applies it.

## Build gates before trusting them

Every check in `tools/email-render-gate/` must be proven to FAIL on known-bad input before its
pass is worth anything. A lint that is blind to a class reads as a pass, which is worse than no
lint. When a template adds a display class, add it to `lint-word.js` in the same commit.
