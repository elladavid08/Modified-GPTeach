#!/bin/sh
# Renders the benchmark SVGs to 300x300 PNGs with macOS Quick Look (no extra dependencies).
# On other systems, any SVG renderer producing a 300x300 PNG with the same name works.
set -e
cd "$(dirname "$0")/../assets"
for f in *.svg; do
  qlmanage -t -s 300 -o . "$f" >/dev/null 2>&1
  mv "$f.png" "${f%.svg}.png"
  echo "rendered ${f%.svg}.png"
done
