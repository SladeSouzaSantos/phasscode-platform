FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY apps/orbe-node/package.json apps/orbe-node/package.json
COPY apps/worker-node/package.json apps/worker-node/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/shared-config/package.json packages/shared-config/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/integrations/package.json packages/integrations/package.json
RUN npm ci --ignore-scripts

FROM dependencies AS test
COPY tsconfig.json vitest.config.ts vitest.integration.config.ts ./
COPY apps apps
COPY packages packages
COPY tests tests
COPY knowledge knowledge
COPY infrastructure/postgres/migrations infrastructure/postgres/migrations
CMD ["npm", "run", "test:integration"]

FROM dependencies AS build
COPY tsconfig.json tsconfig.build.json ./
COPY apps apps
COPY packages packages
RUN npm run build
RUN npm prune --omit=dev --ignore-scripts

FROM node:24-alpine AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/apps/orbe-node/package.json ./apps/orbe-node/package.json
COPY --from=build --chown=node:node /app/apps/worker-node/package.json ./apps/worker-node/package.json
COPY --from=build --chown=node:node /app/packages ./packages
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node knowledge ./knowledge
COPY --chown=node:node apps/orbe-node/prompts ./apps/orbe-node/prompts
COPY --chown=node:node infrastructure/postgres/migrations ./infrastructure/postgres/migrations
USER node
EXPOSE 3000
CMD ["npm", "start"]
