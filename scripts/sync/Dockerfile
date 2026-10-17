FROM python:3.12-alpine

# Install curl for DNS-bypass image downloads + ca-certificates
RUN apk add --no-cache curl ca-certificates

WORKDIR /app

# Install Python deps (pillow for PNG->WebP conversion in official importer)
RUN pip install --no-cache-dir requests beautifulsoup4 pillow

# Copy sync scripts
COPY scripts/sync/sync_all.py /app/sync_all.py
COPY scripts/sync/import_official_cards.py /app/import_official_cards.py

# Runner: run the standard sync, then refresh official-site card imports
# (idempotent — existing cards are updated in place, existing images skipped).
COPY scripts/sync/run_sync.sh /app/run.sh
RUN chmod +x /app/run.sh

# Create data and log dirs
RUN mkdir -p /app/data /app/card-images /app/logs

# Default: run sync once
ENV DB_PATH=/app/data/pokemon_tcg.db
ENV IMAGE_DIR=/app/card-images
ENV SYNC_LOG=/app/logs/sync.log
ENV SYNC_WORKERS=8
ENV SYNC_TIMEOUT=20
ENV OFFICIAL_EXPANSIONS="MA6 MA5"

ENTRYPOINT ["/app/run.sh"]
