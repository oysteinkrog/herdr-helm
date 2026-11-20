#!/bin/bash
# fake-claude.sh [TITLE]: a stand-in Claude Code session for the Artifacts panel in a sandbox.
# It writes what artifacts.py reads (a session file for its own pid and a transcript with one
# published artifact and one link) under $HOME/.claude, reports itself as an idle Claude Code
# agent, and then waits. Run it inside a sandbox terminal; it refuses outside a sandbox HOME.
case "$HOME" in /var/tmp/claude/helm-sbx/*) ;; *) echo "fake-claude: HOME is not a sandbox folder" >&2; exit 3 ;; esac
title=${1:-Sandbox demo}
sid=$(printf 'fake-%s-%s' "$$" "$(date +%s)")
mkdir -p "$HOME/.claude/sessions" "$HOME/.claude/projects/sandbox"
printf '{"pid":%s,"sessionId":"%s","cwd":"%s"}\n' "$$" "$sid" "$PWD" > "$HOME/.claude/sessions/$$.json"
now=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
t="$HOME/.claude/projects/sandbox/$sid.jsonl"
{
  printf '{"type":"user","cwd":"%s","timestamp":"%s","message":{"role":"user","content":"make a page"}}\n' "$PWD" "$now"
  printf '{"type":"assistant","timestamp":"%s","message":{"role":"assistant","content":[{"type":"tool_use","id":"tu1","name":"Artifact","input":{"action":"publish","file_path":"/tmp/demo.html","title":"%s","description":"A page made in the sandbox"}}]}}\n' "$now" "$title"
  printf '{"type":"user","timestamp":"%s","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tu1","content":"Published %s at https://claude.ai/artifact/sandboxdemo01 (Version 2, private)"}]}}\n' "$now" "$title"
  printf '{"type":"assistant","timestamp":"%s","message":{"role":"assistant","content":[{"type":"text","text":"Done. See [the docs](https://example.com/docs) too."}]}}\n' "$now"
} > "$t"
printf '\e]7501;state=idle:app=claude-code\a'
echo "fake Claude session $sid with one artifact"
while :; do sleep 30; done
