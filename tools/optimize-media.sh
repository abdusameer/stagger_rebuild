#!/usr/bin/env bash
# Builds web-ready copies from the master files in stagger/. Masters are never modified.
# Requires: ffmpeg, cwebp (brew install ffmpeg webp), python3 with Pillow.
set -euo pipefail
cd "$(dirname "$0")/.."
M=stagger

webp() { # src width quality [out]
  local src="$1" w="$2" q="${3:-80}" out="${4:-}"
  [ -n "$out" ] || out="${src%.*}-$w.webp"
  local sw
  sw=$(sips -g pixelWidth "$src" | awk '/pixelWidth/{print $2}')
  [ "$sw" -lt "$w" ] && w=$sw
  cwebp -quiet -q "$q" -alpha_q 95 -m 6 -sharp_yuv -resize "$w" 0 "$src" -o "$out"
  echo "$out"
}

# Brand
mkdir -p "$M/images/brand"
[ -f "$M/images/brand/stagger-logo.png" ] || curl -sL -o "$M/images/brand/stagger-logo.png" \
  "https://staggercoffee.com/cdn/shop/files/stagger_logo.png?v=1744670773"

# Story / people
for w in 1200 2000; do webp "$M/images/people/journaling-with-matcha-sunlit-table.jpg" $w; done

# Signature menu cutouts: trim transparent padding, then export at native and half size.
python3 - "$M" <<'PY'
import sys
from PIL import Image
m = sys.argv[1]
src = {
  'double-matcha': 'signature meny/doublematcha.png',
  'cream-top': 'signature meny/creamtop.png',
  'strawberry-matcha': 'signature meny/strawberrymacha.png',
  'stagger-tonic': 'signature meny/orangetonic.png',
  'donut-latte': 'signature meny/dounutholecoffee.png',
}
for name, path in src.items():
    im = Image.open(f"{m}/images/{path}").convert('RGBA')
    bbox = im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    im.crop(bbox).save(f"/tmp/stagger-trim-{name}.png")
PY
for d in double-matcha cream-top strawberry-matcha stagger-tonic donut-latte; do
  t="/tmp/stagger-trim-$d.png"
  full=$(sips -g pixelWidth "$t" | awk '/pixelWidth/{print $2}')
  webp "$t" "$full" 88 "$M/images/drinks/signature-$d-$full.webp"
  half=$((full / 2))
  webp "$t" "$half" 86 "$M/images/drinks/signature-$d-$half.webp"
  rm "$t"
done

# Matcha campaign (dark studio series)
webp "$M/images/Macha buying/b51b8a73-7f73-47bf-9641-1e6a6a17dcfc.png" 1024 84 "$M/images/matcha/campaign-drink-1024.webp"
webp "$M/images/Macha buying/b51b8a73-7f73-47bf-9641-1e6a6a17dcfc.png" 640 82 "$M/images/matcha/campaign-drink-640.webp"
webp "$M/images/Macha buying/a33d0ffc-7903-47af-a4b8-fe1c697c5bc4.png" 1338 84 "$M/images/matcha/campaign-tin-open-1338.webp"
webp "$M/images/Macha buying/a33d0ffc-7903-47af-a4b8-fe1c697c5bc4.png" 800 82 "$M/images/matcha/campaign-tin-open-800.webp"
webp "$M/images/Macha buying/fd2f2153-f8ac-405c-85f3-68ad30209d53.png" 1309 84 "$M/images/matcha/campaign-tin-spill-1309.webp"
webp "$M/images/Macha buying/fd2f2153-f8ac-405c-85f3-68ad30209d53.png" 800 82 "$M/images/matcha/campaign-tin-spill-800.webp"

# Matcha tools (dark product shots)
webp "$M/images/matcha/bamboo-whisk-chasen-1.png" 800 82
webp "$M/images/matcha/bamboo-scoop-chashaku-1.png" 800 82
webp "$M/images/matcha/ceramic-bowl-set-4.jpg" 800 82

# Coffee
for w in 1200 2000; do webp "$M/images/coffee/latte-art-cappuccino-coffee-beans.jpg" $w; done
webp "$M/images/coffee/coffee-bean-bag-1.jpg" 900


# Coffee story (masters in "coffee selling")
for w in 1400 2200; do webp "$M/images/coffee selling/Agent_Image___Extreme_macro_close_up_of_a_single_roasted_coffee_bean_s_surface__revealing_rich_roast.png" $w 84 "$M/images/coffee/roast-bean-macro-$w.webp"; done
# One frame lifted from the supplied storyboard sheet (bean at rest, sunlit).
ffmpeg -v error -y -i "$M/images/coffee selling/d3a1264c-94fd-4291-ba8b-601454f60cc3.png" -vf "crop=557:400:557:478" /tmp/stagger-bean-rest.png
webp /tmp/stagger-bean-rest.png 557 88 "$M/images/coffee/bean-at-rest-557.webp"
rm /tmp/stagger-bean-rest.png
webp "$M/images/coffee/coffee-bean-bag-1.jpg" 1200

# Objects
webp "$M/images/matcha/organic-ceremonial-matcha-tin-1.jpg" 1000
webp "$M/images/products/tumbler-1.jpg" 1000
webp "$M/images/products/tshirt-1.png" 1000
webp "$M/images/products/premium-tote-bag-1.png" 1000

# Community
for w in 1200 2000; do webp "$M/images/products/pastry-and-drink-flatlay-black-table.jpg" $w; done
webp "$M/images/lifestyle/red-green-drink-blue-sky.jpg" 1000
webp "$M/images/interior/two-drinks-black-table-interior.jpg" 1000

# Hero video: top-down matcha (portrait master) cropped square around the glass, which also drops the
# generator mark in the bottom corner. Short GOP so scroll-scrubbing seeks cheaply.
HERO="$M/video/hero/vidu-video-3471260911613331.mp4"
SCRUB="-an -c:v libx264 -preset slow -pix_fmt yuv420p -sc_threshold 0 -bf 0 -movflags +faststart"
ffmpeg -v error -y -i "$HERO" -vf "crop=1080:1080:0:400" $SCRUB -crf 21 -g 2 -keyint_min 2 "$M/video/hero/matcha-topdown-1080.mp4"
ffmpeg -v error -y -i "$HERO" -vf "crop=1080:1080:0:400,scale=720:720:flags=lanczos" $SCRUB -crf 22 -g 2 -keyint_min 2 "$M/video/hero/matcha-topdown-720.mp4"
ffmpeg -v error -y -i "$M/video/hero/matcha-topdown-1080.mp4" -frames:v 1 -q:v 2 /tmp/stagger-hero-poster.jpg
cwebp -quiet -q 82 -sharp_yuv /tmp/stagger-hero-poster.jpg -o "$M/video/hero/matcha-topdown-poster.webp" && rm /tmp/stagger-hero-poster.jpg

# Coffee film: frames 119–132 (a second bean morphs in) are cut, so the bean lands in one clean edit.
COFFEE="$M/video/Staggercoffee.mp4"
mkdir -p "$M/video/coffee"
ffmpeg -v error -y -i "$COFFEE" -filter_complex \
  "[0:v]trim=start_frame=0:end_frame=119,setpts=PTS-STARTPTS[a];[0:v]trim=start_frame=133:end_frame=240,setpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=1[c]" \
  -map "[c]" $SCRUB -crf 21 -g 4 -keyint_min 4 "$M/video/coffee/bean-story-1280.mp4"
for pair in "0:poster:80" "7.9:macro:82"; do
  IFS=: read -r at name q <<< "$pair"
  ffmpeg -v error -y -ss "$at" -i "$M/video/coffee/bean-story-1280.mp4" -frames:v 1 -q:v 2 /tmp/stagger-coffee.jpg
  cwebp -quiet -q "$q" -sharp_yuv /tmp/stagger-coffee.jpg -o "$M/video/coffee/bean-story-$name.webp"
done
rm -f /tmp/stagger-coffee.jpg

# Café videos (existing verified segments)
video() { # src out start duration width poster_at
  local src="$1" out="$2" ss="$3" t="$4" w="$5" pat="$6"
  ffmpeg -v error -y -ss "$ss" -t "$t" -i "$src" -an -c:v libx264 -preset slow -crf 25 -maxrate 900k -bufsize 900k \
    -pix_fmt yuv420p -profile:v high -vf "scale=$w:-2" -movflags +faststart "$out"
  ffmpeg -v error -y -ss "$pat" -i "$out" -frames:v 1 -q:v 3 /tmp/stagger-poster.jpg
  cwebp -quiet -q 78 /tmp/stagger-poster.jpg -o "${out%.mp4}-poster.webp" && rm /tmp/stagger-poster.jpg
  echo "$out"
}
video "$M/video/cafe/three-drinks-interior-reveal.mp4" "$M/video/cafe/three-drinks-interior-reveal-web.mp4" 0 6.5 572 4
video "$M/video/cafe/stagger-wall-mural-drinks.mp4" "$M/video/cafe/stagger-wall-mural-web.mp4" 0 5 720 1
