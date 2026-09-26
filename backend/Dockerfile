FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S mizan && adduser -S -G mizan mizan
COPY --from=build --chown=mizan:mizan /app/node_modules ./node_modules
COPY --from=build --chown=mizan:mizan /app/dist ./dist
COPY --chown=mizan:mizan migrations ./migrations
COPY --chown=mizan:mizan package.json ./package.json
USER mizan
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:4000/api/health/ready >/dev/null || exit 1
CMD ["node", "dist/server.js"]
