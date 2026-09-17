FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium curl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json ./
COPY --from=build /app/example-certificate.html ./example-certificate.html
COPY --from=build /app/certificate-background-v2.png ./certificate-background-v2.png
COPY --from=build /app/certificate-recognition-logos.png ./certificate-recognition-logos.png
COPY --from=build /app/certificate-gear.svg ./certificate-gear.svg
COPY --from=build /app/certificate-flag.svg ./certificate-flag.svg
COPY --from=build /app/certificate-beest-logo.webp ./certificate-beest-logo.webp
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
RUN npm ci --omit=dev
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1
CMD ["node", "dist/main"]
