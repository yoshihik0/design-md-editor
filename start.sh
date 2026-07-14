#!/bin/sh
set -eu

cd "$(dirname "$0")"
PORT="${1:-3000}"

if command -v node >/dev/null 2>&1; then
  echo "D.md: Node.jsサーバーで起動します"
  exec node server.mjs "$PORT"
fi

if command -v python3 >/dev/null 2>&1; then
  echo "D.md: Pythonサーバーで起動します"
  exec python3 server.py "$PORT"
fi

if command -v python >/dev/null 2>&1; then
  echo "D.md: Pythonサーバーで起動します"
  exec python server.py "$PORT"
fi

echo "Node.jsまたはPython 3が必要です。" >&2
exit 1
