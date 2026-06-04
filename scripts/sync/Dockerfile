FROM python:3.12-alpine

# Install curl for DNS-bypass image downloads + ca-certificates
RUN apk add --no-cache curl ca-certificates

WORKDIR /app

# Install Python deps
RUN pip install --no-cache-dir requests beautifulsoup4

# Copy sync script
COPY scripts/sync/sync_all.py /app/sync_all.py

# Create data and log dirs
RUN mkdir -p /app/data /app/card-images /app/logs

# Default: run sync once
ENV DB_PATH=/app/data/pokemon_tcg.db
ENV IMAGE_DIR=/app/card-images
ENV SYNC_LOG=/app/logs/sync.log
ENV SYNC_WORKERS=8
ENV SYNC_TIMEOUT=20

CMD ["python", "/app/sync_all.py"]
