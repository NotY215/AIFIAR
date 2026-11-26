FROM node:22-alpine AS build
WORKDIR /app
COPY package.json tsconfig.json ./
COPY core ./core
COPY models ./models
COPY connectors ./connectors
COPY Main.md AGENTS.md ./
RUN npm install --ignore-scripts && npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production AIFIAR_REMOTE_HOST=0.0.0.0 AIFIAR_REMOTE_PORT=8787
WORKDIR /app
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/models ./models
COPY --from=build --chown=node:node /app/Main.md /app/AGENTS.md ./
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD node -e "fetch('http://127.0.0.1:8787/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","dist/connectors/remote/httpServer.js"]