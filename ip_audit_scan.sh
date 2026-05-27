#!/usr/bin/env bash
set -euo pipefail

out=/tmp/ip_audit_raw.tsv
: > "$out"

mapfile -t roots < <(
  findmnt -rno TARGET,FSTYPE |
  awk '$2 ~ /^(ext4|overlay|xfs|btrfs)$/ {print $1}' |
  while read -r p; do [[ -d "$p" ]] && echo "$p"; done |
  sort -u
)

: > /tmp/ip_pattern_matches.txt
for r in "${roots[@]}"; do
  find "$r" -xdev -type f \( -iname '*MODEL_95*' -o -path '*/stuff/Titan/*' \) -print 2>/dev/null || true
done >> /tmp/ip_pattern_matches.txt
sort -u /tmp/ip_pattern_matches.txt -o /tmp/ip_pattern_matches.txt

: > /tmp/ip_content_matches.txt
for r in "${roots[@]}"; do
  grep -RIl --binary-files=without-match -E 'PROPRIETARY â€” TRADE SECRET|PROPRIETARY — TRADE SECRET' "$r" 2>/dev/null || true
done >> /tmp/ip_content_matches.txt
sort -u /tmp/ip_content_matches.txt -o /tmp/ip_content_matches.txt

cat /tmp/ip_pattern_matches.txt /tmp/ip_content_matches.txt | sort -u > /tmp/ip_all_matches.txt

while IFS= read -r f; do
  [[ -f "$f" ]] || continue
  size=$(stat -c '%s' "$f" 2>/dev/null || echo '')
  mtime=$(stat -c '%y' "$f" 2>/dev/null | cut -d'.' -f1 || echo '')
  sha=$(sha256sum "$f" 2>/dev/null | awk '{print $1}' || echo '')

  flags=''
  [[ "${f##*/}" == *MODEL_95* ]] && flags+="name:MODEL_95;"
  [[ "$f" == */stuff/Titan/* ]] && flags+="path:stuff/Titan;"
  if grep -q -E 'PROPRIETARY â€” TRADE SECRET|PROPRIETARY — TRADE SECRET' "$f" 2>/dev/null; then
    flags+="content:TRADE_SECRET;"
  fi

  printf '%s\t%s\t%s\t%s\t%s\n' "$f" "$size" "$mtime" "$sha" "$flags" >> "$out"
done < /tmp/ip_all_matches.txt

echo "ROOTS_SCANNED=${#roots[@]}"
echo "MATCH_COUNT=$(wc -l < "$out" | tr -d ' ')"
echo "OUT=$out"
