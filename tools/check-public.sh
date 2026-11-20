#!/bin/bash
# check-public.sh: refuse a commit that would put machine details into this public repo.
# It looks at the files staged for commit for IP addresses and tailnet names, and for every
# word listed in ~/.config/herdr-helm/private-words.txt (one per line, kept outside the repo:
# host names, account names, machine names).
cd "$(dirname "$0")/.."
words=${HELM_PRIVATE_WORDS:-$HOME/.config/herdr-helm/private-words.txt}
files=$(git diff --cached --name-only --diff-filter=ACM)
[ -n "$files" ] || exit 0
bad=0
# IPv4 addresses other than 127.0.0.1 and 0.0.0.0, and tailnet host names.
if git diff --cached -U0 -- $files | grep -E '^\+' | grep -vE '^\+\+\+' | grep -nE '\b(([0-9]{1,3}\.){3}[0-9]{1,3})\b|\.ts\.net\b' | grep -vE '\b(127\.0\.0\.1|0\.0\.0\.0)\b'; then bad=1; fi
if [ -f "$words" ]; then
  while IFS= read -r w; do
    [ -z "$w" ] && continue
    if git diff --cached -U0 -- $files | grep -E '^\+' | grep -vE '^\+\+\+' | grep -niwF -- "$w"; then bad=1; fi
  done <"$words"
fi
[ $bad = 0 ] || { echo "check-public: the lines above look like machine details; keep them out of this repo" >&2; exit 1; }
