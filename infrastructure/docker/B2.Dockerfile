# Only a temporary allowlisted snapshot of the two repositories is the build context.
FROM node:24-bookworm-slim AS node24
FROM mcr.microsoft.com/playwright:v1.64.1-noble

# Keep the backend's Node 24/npm 11 requirement, with the official browser dependencies.
COPY --from=node24 /usr/local/ /usr/local/
ENV CI=true PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
COPY backend/apps/orbe-node/package.json ./apps/orbe-node/package.json
COPY backend/apps/worker-node/package.json ./apps/worker-node/package.json
COPY backend/packages/contracts/package.json ./packages/contracts/package.json
COPY backend/packages/database/package.json ./packages/database/package.json
COPY backend/packages/integrations/package.json ./packages/integrations/package.json
COPY backend/packages/shared-config/package.json ./packages/shared-config/package.json
RUN npm ci --ignore-scripts --no-audit --no-fund
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund \
    && node -e "if(require('./node_modules/playwright-core/package.json').version!=='1.64.1')process.exit(1)"
COPY frontend/ ./
WORKDIR /app/backend
COPY backend/ ./
COPY source-manifest.json /app/b2-source-manifest.json
CMD ["node", "scripts/b2-runtime.mjs"]
