# ============================
# GetFit AI Backend
# ============================
FROM node:20-slim

# ---- System dependencies for PDF + OCR ----
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    poppler-utils \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# ---- App setup ----
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

EXPOSE 8080
ENV NODE_ENV=production
ENV PORT=8080

CMD ["node", "src/server.js"]