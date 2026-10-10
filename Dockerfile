# Shopee → Facebook Page auto-poster. One container, exactly one instance, volume at /data.
# Base image version must match the playwright npm package (package.json: 1.56.1).
FROM mcr.microsoft.com/playwright:v1.56.1-noble AS deps
WORKDIR /app
# build tools only in this stage, in case better-sqlite3 has no prebuilt binary for this platform
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM mcr.microsoft.com/playwright:v1.56.1-noble
RUN apt-get update \
 && apt-get install -y --no-install-recommends fonts-noto-cjk fonts-noto-color-emoji tzdata \
 && rm -rf /var/lib/apt/lists/*
ENV TZ=Asia/Kuala_Lumpur \
    NODE_ENV=production \
    DATA_DIR=/data \
    PORT=4545
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p /data
VOLUME /data
EXPOSE 4545
HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4545)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node","src/server.js"]
