# syntax=docker/dockerfile:1
# BTS Soundboard server image (ADR-0007).
# Multi-stage: node:20 build stage -> node:20-alpine runtime stage.
# Server deps are pure Node (ws, busboy, mp3-duration, zod); no native modules,
# so the alpine runtime is safe.

# ---- build stage ----------------------------------------------------------- #
FROM node:20 AS build

WORKDIR /repo

# Enable pnpm via corepack, pinned to the root packageManager version.
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# Copy lockfile + workspace manifests first for install-layer caching.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY apps/desktop/package.json apps/desktop/
COPY packages/shared/package.json packages/shared/

# Install all workspace deps (frozen lockfile for reproducibility).
RUN pnpm install --frozen-lockfile

# Copy source for the packages the server image needs (shared + server).
COPY packages/shared ./packages/shared
COPY apps/server ./apps/server

# Build shared first (server imports it), then the server.
RUN pnpm -F @bts-soundboard/shared build && pnpm -F @bts-soundboard/server build

# Bundle the server with its production dependencies into a self-contained dir.
# --prod excludes devDependencies; --ignore-scripts avoids postinstall hooks.
# Workspace deps (e.g. @bts-soundboard/shared) are resolved + copied in.
RUN pnpm -F @bts-soundboard/server deploy --prod --ignore-scripts /tmp/server-deploy

# ---- runtime stage --------------------------------------------------------- #
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

# Production node_modules (pruned, with shared bundled) from the deploy output,
# plus the server package.json and the built dist/ (copied explicitly so we never
# depend on deploy/gitignore file-set behavior).
COPY --from=build /tmp/server-deploy/node_modules ./node_modules
COPY --from=build /tmp/server-deploy/package.json ./package.json
COPY --from=build /repo/apps/server/dist ./dist

EXPOSE 8080

CMD ["node", "dist/index.js"]
