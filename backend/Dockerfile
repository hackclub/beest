FROM node:22-alpine AS build
ENV PUPPETEER_SKIP_DOWNLOAD=true
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
RUN apk add --no-cache curl chromium nss freetype harfbuzz ttf-freefont
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json ./
COPY --from=build /app/example-certificate.html ./example-certificate.html
COPY --from=build /app/certificate-background-v2.png ./certificate-background-v2.png
COPY --from=build /app/stone-breaker.woff2 ./stone-breaker.woff2
COPY --from=build /app/certificate-recognition-logos.png ./certificate-recognition-logos.png
RUN npm ci --omit=dev
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1
CMD ["node", "dist/main"]
