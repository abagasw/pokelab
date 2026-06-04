# Build static Astro frontend.
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG PUBLIC_API_URL=/api/v1
ENV PUBLIC_API_URL=${PUBLIC_API_URL}

RUN npm run build

# Serve static assets and proxy API to backend.
FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

RUN set -eux; \
  latest="$(ls /usr/share/nginx/html/_astro/CardDetailPage.*.js | head -n 1)"; \
  cp "$latest" /usr/share/nginx/html/_astro/CardDetailPage.js

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
