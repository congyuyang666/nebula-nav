FROM node:22-alpine

WORKDIR /app

COPY package.json server.js seed.json ./
COPY public ./public

ENV PORT=8080
ENV HOST=0.0.0.0
ENV DATA_DIR=/data

EXPOSE 8080
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:8080/api/health >/dev/null 2>&1 || exit 1

CMD ["node", "server.js"]
