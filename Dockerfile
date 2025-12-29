# ============================
# GetFit AI Backend
# ============================
FROM node:20-bullseye

# ---- System dependencies for PDF + OCR ----
WORKDIR /app

RUN apt-get update && apt-get install -y \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# ---- App setup ----
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

EXPOSE 8080
ENV NODE_ENV=production
ENV PORT=8080

CMD ["node", "src/server.js"]