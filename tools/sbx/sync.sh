#!/bin/bash
# sync.sh [NAME]: copy this working tree's helm mod, layout and keys into the sandbox NAME.
# The layout goes in as "krog-next" beside the sandbox's copy of the old "krog", and the keys
# into its "layout:krog-next" section. Never touches the real ~/.config/herdr-app.
set -eu
name=${1:-a}
root=$(cd "$(dirname "$0")/../.." && pwd)
run=/var/tmp/claude/helm-sbx/$name
"$root/tools/sbx/guard.sh" "$run/env" || exit 3
app=$(. "$run/env"; echo "$HERDR_APP_HOME")
case "$app" in /var/tmp/claude/helm-sbx/*) ;; *) echo "sync: not a sandbox app home" >&2; exit 3 ;; esac
mkdir -p "$app/mods/helm"
rsync -a --delete --exclude gpui-kit.d.ts --exclude jsconfig.json "$root/helm/" "$app/mods/helm/"
cp "$root/layouts/krog.json" "$app/layouts/krog-next.json.tmp" && mv "$app/layouts/krog-next.json.tmp" "$app/layouts/krog-next.json"
python3 -I - "$app/keys.json" "$root/keys/layout-krog.json" <<'PY'
import json, os, sys
keys_path, section_path = sys.argv[1], sys.argv[2]
keys = json.load(open(keys_path))
keys["layout:krog-next"] = json.load(open(section_path))
tmp = keys_path + ".tmp"
json.dump(keys, open(tmp, "w"), indent=2)
os.replace(tmp, keys_path)
PY
echo "synced helm into $app"
