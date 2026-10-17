#!/bin/sh
# Runner for the scheduled sync container.
# - default (no args / other args): full sync + official-site card refresh
# - --tournaments-only: fast tournament refresh only
set -e

case "$1" in
  --tournaments-only|tournaments-only)
    python /app/sync_all.py --tournaments-only
    exit 0
    ;;
  "")
    python /app/sync_all.py
    python /app/import_official_cards.py
    ;;
  *)
    python /app/sync_all.py "$@"
    python /app/import_official_cards.py
    ;;
esac
