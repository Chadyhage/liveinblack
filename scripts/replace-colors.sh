#!/usr/bin/env bash
# replace-colors-fast.sh — utilise LC_ALL=C sed (BSD sed natif macOS, rapide)
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "→ Recherche des fichiers..."
FILES=$(grep -rln "b8f34a\|9fe022\|10210a\|04120e\|142000\|181104\|F53D8D\|f53d8d\|e02d7d\|FF75AD\|ff75ad\|191218\|241a23\|1d141c\|0a0810\|14101c\|0d0a14\|0a0a0d\|rgba(184[, ]*243[, ]*74\|rgba(245[, ]*61[, ]*141" \
  app lib \
  --include="*.tsx" \
  --include="*.ts" \
  --include="*.css" \
  2>/dev/null | grep -v "globals.css" | grep -v "replace-colors")

COUNT=$(echo "$FILES" | wc -l | tr -d ' ')
echo "→ $COUNT fichiers à traiter..."

echo "$FILES" | while IFS= read -r f; do
  [ -z "$f" ] && continue
  LC_ALL=C perl -i \
    -e 's/#b8f34a/var(--primary)/g;' \
    -e 's/#9fe022/var(--primary-strong)/g;' \
    -e 's/#10210a/var(--primary-ink)/g;' \
    -e 's/#04120e/var(--primary-ink)/g;' \
    -e 's/#142000/var(--primary-ink)/g;' \
    -e 's/#181104/var(--primary-ink)/g;' \
    -e 's/#F53D8D/var(--primary)/g;' \
    -e 's/#f53d8d/var(--primary)/g;' \
    -e 's/#e02d7d/var(--primary-strong)/g;' \
    -e 's/#FF75AD/var(--pink)/g;' \
    -e 's/#ff75ad/var(--pink)/g;' \
    -e 's/#191218/var(--obsidian)/g;' \
    -e 's/#0a0810/var(--obsidian)/g;' \
    -e 's/#0a0a0d/var(--obsidian)/g;' \
    -e 's/#241a23/var(--surface)/g;' \
    -e 's/#14101c/var(--surface)/g;' \
    -e 's/#1d141c/var(--surface-2)/g;' \
    -e 's/#0d0a14/var(--surface-2)/g;' \
    -e 's/rgba\(184\s*,\s*243\s*,\s*74\s*,\s*0?\.?06\)/var(--primary-a06)/g;' \
    -e 's/rgba\(184\s*,\s*243\s*,\s*74\s*,\s*0?\.?07\)/var(--primary-a07)/g;' \
    -e 's/rgba\(184\s*,\s*243\s*,\s*74\s*,\s*0?\.?08\)/var(--primary-a08)/g;' \
    -e 's/rgba\(184\s*,\s*243\s*,\s*74\s*,\s*0?\.?09\)/var(--primary-a09)/g;' \
    -e 's/rgba\(184\s*,\s*243\s*,\s*74\s*,\s*0?\.1\b\)/var(--primary-a10)/g;' \
    -e 's/rgba\(184\s*,\s*243\s*,\s*74\s*,\s*0?\.12\)/var(--primary-a12)/g;' \
    -e 's/rgba\(184\s*,\s*243\s*,\s*74\s*,\s*0?\.14\)/var(--primary-a14)/g;' \
    -e 's/rgba\(184\s*,\s*243\s*,\s*74\s*,\s*0?\.16\)/var(--primary-a16)/g;' \
    -e 's/rgba\(184\s*,\s*243\s*,\s*74\s*,\s*0?\.18\)/var(--border)/g;' \
    -e 's/rgba\(184\s*,\s*243\s*,\s*74\s*,\s*0?\.24\)/var(--primary-a24)/g;' \
    -e 's/rgba\(184\s*,\s*243\s*,\s*74\s*,\s*0?\.28\)/var(--focus-ring-color)/g;' \
    -e 's/rgba\(184\s*,\s*243\s*,\s*74\s*,\s*0?\.32\)/var(--primary-a32)/g;' \
    -e 's/rgba\(184\s*,\s*243\s*,\s*74\s*,\s*0?\.34\)/var(--border-strong)/g;' \
    -e 's/rgba\(184\s*,\s*243\s*,\s*74\s*,\s*0?\.35\)/var(--primary-a35)/g;' \
    -e 's/rgba\(184\s*,\s*243\s*,\s*74\s*,\s*0?\.42\)/var(--primary-a42)/g;' \
    -e 's/rgba\(184\s*,\s*243\s*,\s*74\s*,\s*0?\.55\)/var(--primary-a55)/g;' \
    -e 's/rgba\(184\s*,\s*243\s*,\s*74\s*,\s*0?\.6\b\)/var(--primary-a60)/g;' \
    -e 's/rgba\(184\s*,\s*243\s*,\s*74\s*,\s*0?\.65\)/var(--primary-a65)/g;' \
    -e 's/rgba\(245\s*,\s*61\s*,\s*141\s*,\s*0?\.06\)/var(--primary-a06)/g;' \
    -e 's/rgba\(245\s*,\s*61\s*,\s*141\s*,\s*0?\.07\)/var(--primary-a07)/g;' \
    -e 's/rgba\(245\s*,\s*61\s*,\s*141\s*,\s*0?\.08\)/var(--primary-a08)/g;' \
    -e 's/rgba\(245\s*,\s*61\s*,\s*141\s*,\s*0?\.09\)/var(--primary-a09)/g;' \
    -e 's/rgba\(245\s*,\s*61\s*,\s*141\s*,\s*0?\.1\b\)/var(--primary-a10)/g;' \
    -e 's/rgba\(245\s*,\s*61\s*,\s*141\s*,\s*0?\.12\)/var(--primary-a12)/g;' \
    -e 's/rgba\(245\s*,\s*61\s*,\s*141\s*,\s*0?\.14\)/var(--primary-a14)/g;' \
    -e 's/rgba\(245\s*,\s*61\s*,\s*141\s*,\s*0?\.16\)/var(--primary-a16)/g;' \
    -e 's/rgba\(245\s*,\s*61\s*,\s*141\s*,\s*0?\.18\)/var(--border)/g;' \
    -e 's/rgba\(245\s*,\s*61\s*,\s*141\s*,\s*0?\.24\)/var(--primary-a24)/g;' \
    -e 's/rgba\(245\s*,\s*61\s*,\s*141\s*,\s*0?\.28\)/var(--focus-ring-color)/g;' \
    -e 's/rgba\(245\s*,\s*61\s*,\s*141\s*,\s*0?\.32\)/var(--primary-a32)/g;' \
    -e 's/rgba\(245\s*,\s*61\s*,\s*141\s*,\s*0?\.34\)/var(--border-strong)/g;' \
    -e 's/rgba\(245\s*,\s*61\s*,\s*141\s*,\s*0?\.35\)/var(--primary-a35)/g;' \
    -e 's/rgba\(245\s*,\s*61\s*,\s*141\s*,\s*0?\.42\)/var(--primary-a42)/g;' \
    -e 's/rgba\(245\s*,\s*61\s*,\s*141\s*,\s*0?\.52\)/var(--primary-a52)/g;' \
    -e 's/rgba\(245\s*,\s*61\s*,\s*141\s*,\s*0?\.55\)/var(--primary-a55)/g;' \
    -e 's/rgba\(245\s*,\s*61\s*,\s*141\s*,\s*0?\.65\)/var(--primary-a65)/g;' \
    -e 's/rgba\(245\s*,\s*61\s*,\s*141\s*,\s*0?\.85\)/var(--primary-a85)/g;' \
    "$f"
  echo "  ✓ $f"
done

echo ""
echo "✓ Terminé ! Vérification..."
REMAINING=$(grep -rln "b8f34a\|rgba(184.*243.*74\|rgba(184,243,74" app lib --include="*.tsx" --include="*.ts" --include="*.css" 2>/dev/null | grep -v globals.css | wc -l | tr -d ' ')
echo "→ Fichiers avec couleurs vertes restantes : $REMAINING"
