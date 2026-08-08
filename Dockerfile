# Multi-stage build: compile TypeScript in a full node_modules (including
# devDependencies), then ship only production dependencies + build output.
# better-sqlite3's native binding is built/fetched fresh in each stage by
# `npm install` running inside the (Linux) container, so it always matches
# the container's actual platform regardless of what host built this image.
#
# NOTE: this relies on better-sqlite3 shipping a prebuilt binary for the
# target platform (true for standard linux-x64/arm64, which covers every
# mainstream Docker host). If a build ever fails on "npm ci" trying to
# compile better-sqlite3 from source, switch both FROM lines below from
# `node:22-slim` to plain `node:22`, which includes the compiler toolchain.
# This couldn't be verified with an actual `docker build` in the sandbox
# this was written in (no Docker daemon available there) — verify on
# first real deploy.

FROM node:22-slim AS builder
WORKDIR /app

# Root package.json declares packages/* as an npm workspace, so `npm ci`
# needs that workspace's package.json present too, even though the
# creator CLI itself isn't part of what runs in this image.
COPY package.json package-lock.json ./
COPY packages/cli/package.json ./packages/cli/package.json
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/cli/package.json ./packages/cli/package.json
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY public ./public
COPY scripts/conways-rules.txt ./scripts/conways-rules.txt

# Persistent agent state (wallet, SQLite DB, constitution, SOUL.md,
# audit log) lives here — mount a real persistent volume at this path on
# whatever hosting platform you use, or state resets on every redeploy.
ENV AUTOMATON_HOME=/data
VOLUME ["/data"]

# The platform sets PORT; src/config.ts picks it up and binds 0.0.0.0
# automatically when PORT is present. 4173 is just the documented default
# for local/manual runs.
EXPOSE 4173

CMD ["node", "dist/index.js", "--run"]
