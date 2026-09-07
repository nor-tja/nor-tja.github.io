#!/usr/bin/env bash
# Generate 1200x630 Open Graph cards. Zero dependencies: sips is macOS built-in.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p assets/og
TMP="$(mktemp -d)"

card() {  # slug | title | subtitle
  local slug="$1" title="$2" sub="$3"
  cat > "$TMP/$slug.svg" <<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#f5f2ed"/>
  <rect x="0" y="0" width="1200" height="8" fill="#9a2a2a"/>
  <text x="90" y="300" font-family="Georgia,serif" font-size="88" fill="#1a1814">$title</text>
  <text x="90" y="370" font-family="Georgia,serif" font-size="34" fill="#7a7570">$sub</text>
  <text x="90" y="545" font-family="Courier,monospace" font-size="24" fill="#9a2a2a" letter-spacing="6">KATJA NORSTAD</text>
</svg>
SVG
  sips -s format png "$TMP/$slug.svg" --out "assets/og/$slug.png" >/dev/null
  printf '  %-18s %s\n' "$slug.png" "$(du -h "assets/og/$slug.png" | cut -f1 | tr -d ' ')"
}

card index        "Katja Norstad"       "Data scientist in Oslo, and a few things I built"
card cv           "Curriculum Vitae"    "Data scientist, Oslo — since 2012"
card resources    "Worth your time"     "A small collection of things I keep coming back to"
card pomodoro     "Pomodoro Timer"      "An hourglass that keeps you honest"
card languages    "Practise a language" "Five words a day, with spaced repetition"
card mots-du-jour "Mots du jour"        "Five French words a day"
card spanish      "Palabras del día"    "Five Spanish words a day"
card portuguese   "Palavras do dia"     "Five Portuguese words a day"
card japanese     "今日の単語"           "Five Japanese words a day"
card ukrainian    "Слова дня"           "Five Ukrainian words a day"
card coffee       "Coffee notes"        "52 beans, 6 Oslo roasters, one tasting log"
card snake        "Snake"               "A small game, in a small canvas"

echo "Done. Cards in assets/og/"
