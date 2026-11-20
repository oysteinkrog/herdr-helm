#!/bin/bash
# The old path of freeze.sh, ~/.config/herdr-app/mods/space-freeze/freeze.sh. The herdr-sessions
# skill and the manager sessions call it there. herdr-setup installs this file at that path until
# they call mods/helm/bin/freeze.sh instead; it runs helm's copy with the same arguments, so the
# commands and the JSON output are the same.
exec bash "${HERDR_APP_HOME:-$HOME/.config/herdr-app}/mods/helm/bin/freeze.sh" "$@"
