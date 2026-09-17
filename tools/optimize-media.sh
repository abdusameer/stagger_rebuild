#!/usr/bin/env bash
# Builds web-ready copies next to the originals in stagger/. Originals are never modified.
set -euo pipefail
cd "$(dirname "$0")/.."
M=stagger

webp() { # src width quality
  local src="$1" w="$2" q="${3:-78}"
  local base="${src%.*}" out
  out="$base-$w.webp"
  local sw
  sw=$(sips -g pixelWidth "$src" | awk '/pixelWidth/{print $2}')
  [ "$sw" -lt "$w" ] && w=$sw
  cwebp -quiet -q "$q" -alpha_q 90 -m 6 -resize "$w" 0 "$src" -o "$out"
  echo "$out"
}

video() { # src out start duration width poster_at [maxrate]
  local src="$1" out="$2" ss="$3" t="$4" w="$5" pat="$6" rate="${7:-900k}"
  ffmpeg -v error -y -ss "$ss" -t "$t" -i "$src" -an -c:v libx264 -preset slow -crf 25 \
    -maxrate "$rate" -bufsize "$rate" \
    -pix_fmt yuv420p -profile:v high -vf "scale=$w:-2" -movflags +faststart "$out"
  local poster="${out%.mp4}-poster.jpg"
  ffmpeg -v error -y -ss "$pat" -i "$out" -frames:v 1 -q:v 3 "$poster"
  cwebp -quiet -q 78 "$poster" -o "${poster%.jpg}.webp" && rm "$poster"
  echo "$out"
}

# Brand
mkdir -p "$M/images/brand"
[ -f "$M/images/brand/stagger-logo.png" ] || curl -sL -o "$M/images/brand/stagger-logo.png" \
  "https://staggercoffee.com/cdn/shop/files/stagger_logo.png?v=1744670773"

# Story / people
for w in 1200 2000; do webp "$M/images/people/journaling-with-matcha-sunlit-table.jpg" $w; done

# Signature drink cutouts (transparent PNG)
for d in double-matcha cream-top strawberry-matcha stagger-tonic donut-latte; do
  webp "$M/images/drinks/$d-site.png" 1000 82
done

# Matcha ritual
for w in 900 1500; do webp "$M/images/hero/matcha-cup-isolated-black-background.jpg" $w; done
webp "$M/images/matcha/matcha-tools-on-stagger-box.jpg" 1000
for w in 1200 2000; do webp "$M/images/matcha/matcha-latte-and-tin-sunlit-table.jpg" $w; done

# Coffee
for w in 1200 2000; do webp "$M/images/coffee/latte-art-cappuccino-coffee-beans.jpg" $w; done
webp "$M/images/coffee/coffee-bean-bag-1.jpg" 900

# Objects
webp "$M/images/matcha/organic-ceremonial-matcha-tin-1.jpg" 1000
webp "$M/images/products/tumbler-1.jpg" 1000
webp "$M/images/products/tshirt-1.png" 1000
webp "$M/images/products/premium-tote-bag-1.png" 1000

# Community
for w in 1200 2000; do webp "$M/images/products/pastry-and-drink-flatlay-black-table.jpg" $w; done
webp "$M/images/lifestyle/red-green-drink-blue-sky.jpg" 1000
webp "$M/images/interior/two-drinks-black-table-interior.jpg" 1000

# Video: verified segments
video "$M/video/hero/macro-drink-montage.mp4" "$M/video/hero/macro-drink-montage-web.mp4" 0 24.2 576 1 650k
video "$M/video/cafe/three-drinks-interior-reveal.mp4" "$M/video/cafe/three-drinks-interior-reveal-web.mp4" 0 6.5 572 4
video "$M/video/cafe/stagger-wall-mural-drinks.mp4" "$M/video/cafe/stagger-wall-mural-web.mp4" 0 5 720 1
