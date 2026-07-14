#!/bin/sh
cd "$(dirname "$0")" || exit 1
PORT="${1:-3000}"
(sleep 1; open "http://localhost:${PORT}/") &
exec ./start.sh "$PORT"
