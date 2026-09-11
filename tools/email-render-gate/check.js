#!/usr/bin/env node
// ONE COMMAND. Run this on an email before it is delivered, every time.
//
//     node check.js ../../emails/<name>.html
//
// It builds the client variants and runs every gate in the right order, then regenerates the
// PASTE build and proves the two render identically. A gate that is remembered sometimes is a
// gate that does not exist, which is how the specificity bug survived in four finished sends:
// each gate passed on the day it was written and nothing re-ran them afterwards.
//
// Exit code is non-zero if ANY stage fails, so it can sit in a hook or CI step unchanged.
const { spawnSync } = require("child_process")
const fs = require("fs"), path = require("path")

const src = process.argv[2]
if (!src) { console.error("usage: node check.js <email.html>"); process.exit(2) }
if (!fs.existsSync(src)) { console.error(`no such file: ${src}`); process.exit(2) }
if (/\.PASTE\.html$/.test(src)) {
    console.error("point this at the MASTER file, not the PASTE build — the paste is generated.")
    process.exit(2)
}
const paste = src.replace(/\.html$/, ".PASTE.html")
const here = __dirname
const run = (label, args, opts = {}) => {
    const r = spawnSync("node", args, { cwd: here, encoding: "utf8" })
    const out = (r.stdout || "") + (r.stderr || "")
    const failed = r.status !== 0
    if (failed || !opts.quiet) process.stdout.write(out.replace(/^/gm, "    ").trimEnd() + "\n")
    console.log(`${failed ? "  ✗" : "  ✓"} ${label}`)
    return !failed
}

console.log(`\n=== ${path.basename(src)}`)
let ok = true

// Order matters. Nothing downstream is meaningful until the variants build.
ok = run("build — six client variants", ["build.js", src], { quiet: true }) && ok
if (!ok) { console.log("\nBUILD FAILED — nothing else ran.\n"); process.exit(1) }

ok = run("verify  — geometry: overflow, shell width, collisions, buttons, aspect", ["verify.js"], { quiet: true }) && ok
ok = run("upgrade — the @media screen display upgrade actually wins", ["upgrade.js", src], { quiet: true }) && ok
ok = run("orphans — no centred block ends on a runt last line", ["orphans.js", src], { quiet: true }) && ok
ok = run("lint    — source rules Chromium cannot see", ["lint-word.js", src], { quiet: true }) && ok

// The paste build is what actually goes into Paytronix, so it is not optional and it is not
// a copy step: regenerate it here and prove it renders identically to the master.
ok = run("strip   — regenerate the PASTE build", ["strip.js", src, paste], { quiet: true }) && ok
if (ok) {
    spawnSync("node", ["build.js", src], { cwd: here })
    spawnSync("node", ["diff.js", "master"], { cwd: here })
    spawnSync("node", ["build.js", paste], { cwd: here })
    spawnSync("node", ["diff.js", "paste"], { cwd: here })
    const py = spawnSync("python3", ["-c", `
from PIL import Image, ImageChops
bad = []
for n in ["m900", "w900", "m375"]:
    a = Image.open("diff-master-%s.png" % n).convert("RGB")
    b = Image.open("diff-paste-%s.png" % n).convert("RGB")
    if a.size != b.size or ImageChops.difference(a, b).getbbox() is not None:
        bad.append(n)
print("DIFFERS: " + ", ".join(bad) if bad else "master and paste are pixel-identical")
raise SystemExit(1 if bad else 0)
`], { cwd: here, encoding: "utf8" })
    process.stdout.write("    " + (py.stdout || py.stderr).trim() + "\n")
    console.log(`${py.status ? "  ✗" : "  ✓"} diff    — master vs paste at modern 900, Word 900, mobile 375`)
    ok = py.status === 0 && ok
}

// The repo agreement: the reply that delivers an email carries the PASTE build inline. Print
// where it is so there is no excuse for shipping a file path instead of the HTML.
console.log(ok
    ? `\nALL GATES PASS. Paste build: ${paste}\nRULE ZERO: the full contents of that file go inline in the chat reply, in one html code block.\n`
    : `\nGATES FAILED — do not deliver this email.\n`)
process.exit(ok ? 0 : 1)
