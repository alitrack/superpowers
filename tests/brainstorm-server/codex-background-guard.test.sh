#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
START_SCRIPT="$REPO_ROOT/skills/brainstorming/scripts/start-server.sh"
TMP_PROJECT="$(mktemp -d /tmp/brainstorm-codex-guard-XXXXXX)"
OUTPUT_FILE="$TMP_PROJECT/output.json"

cleanup() {
  rm -rf "$TMP_PROJECT"
}
trap cleanup EXIT

set +e
CODEX_CI=1 "$START_SCRIPT" --project-dir "$TMP_PROJECT" --background >"$OUTPUT_FILE" 2>&1
status=$?
set -e

if [[ $status -eq 0 ]]; then
  echo "Expected start-server.sh --background to fail under CODEX_CI"
  cat "$OUTPUT_FILE"
  exit 1
fi

if ! grep -q '"error"' "$OUTPUT_FILE"; then
  echo "Expected JSON error output"
  cat "$OUTPUT_FILE"
  exit 1
fi

if ! grep -q -- '--foreground' "$OUTPUT_FILE"; then
  echo "Expected guidance to use --foreground"
  cat "$OUTPUT_FILE"
  exit 1
fi

echo "PASS: CODEX_CI background guard rejects unsafe background mode"
