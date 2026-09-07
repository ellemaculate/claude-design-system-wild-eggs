#!/usr/bin/env python3
"""Cut every image slot for an email from a source photo, at the exact ratio the slot renders at.

WHY THE RATIO IS THE WHOLE POINT
--------------------------------
Outlook Classic renders with the Word engine, which ignores object-fit entirely. Every image in
the Wild Eggs template carries object-fit:cover, so in Chrome, Apple Mail and Gmail a mismatched
source is cropped politely and nobody notices. In Outlook the same file is STRETCHED to whatever
width= and height= say. A square photo dropped into the 210x306 portrait slot does not get
cropped there, it gets squeezed 31% narrower, and faces are the first thing that gives it away.

So the fix is not "make it smaller". The fix is: centre-crop the source to the slot's exact
aspect ratio FIRST, then scale. After that object-fit has nothing left to do and every client
agrees, Word included.

RESOLUTION
----------
Everything exports at 2x its rendered size. That is sharp on a retina phone and stays under the
3x ceiling the render gate enforces (past 3x is invisible in every preview and only costs the
guest mobile data).

BIAS
----
Faces and food sit above centre far more often than below it. --bias shifts the crop window
vertically: 0.0 keeps the top of the frame, 0.5 is centred, 1.0 keeps the bottom. Default 0.42,
slightly above centre, which is right for both a plated dish and a person holding one.

ZOOM, AND WHY A THUMBNAIL IS NOT A SMALL PHOTO
----------------------------------------------
A 46x46 chip is about the size of a lowercase letter. A whole plated scene scaled down to that
reads as brown mush, because at 46px you can only resolve one thing. So the chips are not the
hero shrunk, they are a punch-in on the single subject. --zoom keeps the middle fraction of the
frame before the ratio crop: 1.0 uses the whole frame, 0.45 keeps the middle 45% and throws the
rest away. Chips generally want 0.35-0.55. Large slots want 1.0 and get it by default.

USAGE
    python3 thumbs.py --src cinnamon-roll.jpg --slots hero
    python3 thumbs.py --src cinnamon-roll.jpg --slots chip --zoom 0.45 --prefix roll
    python3 thumbs.py --src team-member.jpg   --slots portrait --bias 0.25
    python3 thumbs.py --src photo.jpg --slots all --out ./exports
"""

import argparse
import os
import sys

from PIL import Image, ImageOps

# Every image slot in the Wild Eggs "cinnamon roll" template, as it actually renders.
# rendered = the width/height attributes in the HTML. export = 2x that.
# The portrait also has a mobile size (196x286, ratio 0.6853); it is within a half percent of the
# desktop ratio, so one crop serves both and nothing shifts when the layout stacks.
SLOTS = {
    "hero":     {"rendered": (600, 692), "note": "full-bleed hero under the yellow rule"},
    "chip":     {"rendered": (46, 46),   "note": "inline thumbnail in the headline (2 of these)"},
    "portrait": {"rendered": (210, 306), "note": "'Behind the plate' card; 196x286 when stacked"},
    "waffle":   {"rendered": (200, 240), "note": "catering block, has a 5px cream frame"},
    "logo":     {"rendered": (240, 89),  "note": "masthead; leave alone unless the logo changed"},
    "social":   {"rendered": (34, 34),   "note": "footer icons; leave alone"},
}
SCALE = 2


def punch_in(im, zoom, bias):
    """Keep the middle `zoom` fraction of the frame, biased vertically. zoom=1.0 is a no-op."""
    if zoom >= 0.999:
        return im
    w, h = im.size
    nw, nh = max(1, round(w * zoom)), max(1, round(h * zoom))
    left = (w - nw) // 2
    top = max(0, min(round((h - nh) * bias), h - nh))
    return im.crop((left, top, left + nw, top + nh))


def cover_crop(im, target_ratio, bias):
    """Centre-crop to an exact aspect ratio, biased vertically. Never upscales the crop window."""
    w, h = im.size
    cur = w / h
    if abs(cur - target_ratio) < 1e-6:
        return im
    if cur > target_ratio:
        # too wide: keep full height, trim the sides evenly
        new_w = round(h * target_ratio)
        left = (w - new_w) // 2
        return im.crop((left, 0, left + new_w, h))
    # too tall: keep full width, trim top/bottom with the bias applied
    new_h = round(w / target_ratio)
    top = round((h - new_h) * bias)
    top = max(0, min(top, h - new_h))
    return im.crop((0, top, w, top + new_h))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="source photo")
    ap.add_argument("--slots", default="all", help="comma-separated slot names, or 'all'")
    ap.add_argument("--out", default=".", help="output directory")
    ap.add_argument("--bias", type=float, default=0.42,
                    help="vertical crop bias 0=top 0.5=centre 1=bottom (default 0.42)")
    ap.add_argument("--prefix", default=None, help="output filename prefix (default: source stem)")
    ap.add_argument("--quality", type=int, default=82, help="JPEG quality (default 82)")
    ap.add_argument("--zoom", type=float, default=1.0,
                    help="keep the middle fraction of the frame before cropping; "
                         "1.0=whole frame, 0.45=punch in hard. Chips want 0.35-0.55 (default 1.0)")
    a = ap.parse_args()

    names = list(SLOTS) if a.slots == "all" else [s.strip() for s in a.slots.split(",")]
    for n in names:
        if n not in SLOTS:
            sys.exit(f"unknown slot '{n}'. known: {', '.join(SLOTS)}")

    # EXIF orientation must be applied before anything else or a phone photo crops the wrong axis.
    im = ImageOps.exif_transpose(Image.open(a.src)).convert("RGB")
    stem = a.prefix or os.path.splitext(os.path.basename(a.src))[0]
    os.makedirs(a.out, exist_ok=True)
    print(f"source: {a.src}  {im.size[0]}x{im.size[1]}  ratio {im.size[0]/im.size[1]:.4f}\n")

    for n in names:
        rw, rh = SLOTS[n]["rendered"]
        ew, eh = rw * SCALE, rh * SCALE
        ratio = rw / rh

        avail = punch_in(im, a.zoom, a.bias).size
        if avail[0] < ew or avail[1] < eh:
            print(f"  WARN  {n}: after zoom the source is {avail[0]}x{avail[1]}, smaller than the "
                  f"{ew}x{eh} export. It will be upscaled and look soft — use a bigger original "
                  f"or a larger --zoom.")

        src = punch_in(im, a.zoom, a.bias)
        out = cover_crop(src, ratio, a.bias).resize((ew, eh), Image.LANCZOS)
        path = os.path.join(a.out, f"{stem}-{n}.jpg")
        out.save(path, "JPEG", quality=a.quality, optimize=True, progressive=True)
        kb = os.path.getsize(path) // 1024
        print(f"  {n:9s} {ew}x{eh}  ({rw}x{rh} @2x, ratio {ratio:.4f})  {kb}KB  -> {path}")
        print(f"            {SLOTS[n]['note']}")


if __name__ == "__main__":
    main()
