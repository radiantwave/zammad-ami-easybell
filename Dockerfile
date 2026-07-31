# syntax=docker/dockerfile:1

FROM node:24-trixie-slim AS builder
WORKDIR /app

COPY package.json package-lock.json tsconfig.json tsconfig.build.json ./
RUN npm ci
COPY src ./src
RUN npm run build

FROM node:24-trixie-slim AS runtime
ENV NODE_ENV=production
ENV HEALTH_FILE=/tmp/health
WORKDIR /app

COPY --from=builder /app/dist ./dist

USER node

# Der Dienst nimmt nichts entgegen, es gibt also keinen Endpunkt zum Abfragen.
# Stattdessen frischt er eine Datei auf, solange die Telefonanlage antwortet; ist
# sie älter als zwei Minuten, gilt der Container als ungesund. Neu gestartet wird
# er dadurch nicht. Das erledigt der Wachhund im Dienst selbst, indem er sich
# beendet und die Neustart-Regel greifen lässt.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["node", "-e", "const {statSync} = require('node:fs'); process.exit(Date.now() - statSync(process.env.HEALTH_FILE || '/tmp/health').mtimeMs < 120000 ? 0 : 1)"]

CMD ["node", "dist/index.js"]
