FROM node:24.16.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY server ./server
COPY public ./public
RUN npm run build

FROM node:24.16.0-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=4320 HOST=0.0.0.0 PLAYER_DATA_DIR=/var/lib/kaiju KAIJU_TRUSTED_PROXY=none
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && mkdir -p /var/lib/kaiju && chown node:node /var/lib/kaiju
COPY --from=build /app/dist ./dist
COPY src ./src
COPY server ./server
COPY scripts/player/backup-public.mjs ./scripts/player/backup-public.mjs
USER node
VOLUME /var/lib/kaiju
EXPOSE 4320
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/status').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server/index.ts"]
