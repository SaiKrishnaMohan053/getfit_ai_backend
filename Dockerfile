# ============================
# GetFit AI Backend
# ============================
FROM node:20-alpine AS base

WORKDIR /app

COPY package.json package-lock.json ./

# Install only production deps
RUN npm ci --omit=dev

COPY src ./src

EXPOSE 8080
ENV NODE_ENV=production
ENV PORT=8080

CMD ["node", "src/server.js"]