# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Public Firebase client config (not secret) — baked for client bundle
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_PROFESSOR_SOL_DIRECTED_GUI_ENABLED=false
ARG GIT_COMMIT_SHA=unknown
ARG GIT_TREE_STATE=unknown
ARG BUILD_CONTEXT_HASH=unknown
ARG CLOUD_BUILD_ID=unknown
ARG DEPLOYED_AT=unknown
ARG SIMPLE_CLERK_VERSION=unknown
ARG EVALUATION_SUITE_VERSION=unknown
ARG GOLDEN_CATALOG_VERSION=unknown
ARG COMMANDER_ELIGIBILITY_VERSION=unknown

ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID
ENV NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ENV NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ENV NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_PROFESSOR_SOL_DIRECTED_GUI_ENABLED=$NEXT_PUBLIC_PROFESSOR_SOL_DIRECTED_GUI_ENABLED
ENV GIT_COMMIT_SHA=$GIT_COMMIT_SHA
ENV GIT_TREE_STATE=$GIT_TREE_STATE
ENV BUILD_CONTEXT_HASH=$BUILD_CONTEXT_HASH
ENV CLOUD_BUILD_ID=$CLOUD_BUILD_ID
ENV DEPLOYED_AT=$DEPLOYED_AT
ENV SIMPLE_CLERK_VERSION=$SIMPLE_CLERK_VERSION
ENV EVALUATION_SUITE_VERSION=$EVALUATION_SUITE_VERSION
ENV GOLDEN_CATALOG_VERSION=$GOLDEN_CATALOG_VERSION
ENV COMMANDER_ELIGIBILITY_VERSION=$COMMANDER_ELIGIBILITY_VERSION

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--max-old-space-size=6144
RUN npm run build -- --webpack

FROM node:22-alpine AS runner
WORKDIR /app

ARG GIT_COMMIT_SHA=unknown
ARG GIT_TREE_STATE=unknown
ARG BUILD_CONTEXT_HASH=unknown
ARG CLOUD_BUILD_ID=unknown
ARG DEPLOYED_AT=unknown
ARG SIMPLE_CLERK_VERSION=unknown
ARG EVALUATION_SUITE_VERSION=unknown
ARG GOLDEN_CATALOG_VERSION=unknown
ARG COMMANDER_ELIGIBILITY_VERSION=unknown

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
ENV HOSTNAME=0.0.0.0
ENV REQUIRE_FIRESTORE=true
ENV GIT_COMMIT_SHA=$GIT_COMMIT_SHA
ENV GIT_TREE_STATE=$GIT_TREE_STATE
ENV BUILD_CONTEXT_HASH=$BUILD_CONTEXT_HASH
ENV CLOUD_BUILD_ID=$CLOUD_BUILD_ID
ENV DEPLOYED_AT=$DEPLOYED_AT
ENV SIMPLE_CLERK_VERSION=$SIMPLE_CLERK_VERSION
ENV EVALUATION_SUITE_VERSION=$EVALUATION_SUITE_VERSION
ENV GOLDEN_CATALOG_VERSION=$GOLDEN_CATALOG_VERSION
ENV COMMANDER_ELIGIBILITY_VERSION=$COMMANDER_ELIGIBILITY_VERSION

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

RUN mkdir -p \
  data/milestones/mechanical-space/commander-optimization-score-v1 \
  data/milestones/mechanical-space/spellbook-win-architecture-space-v1 \
  data/milestones/catalog-shadow
COPY --from=builder --chown=nextjs:nodejs /app/data/milestones/mechanical-space/commander-optimization-score-v1/ ./data/milestones/mechanical-space/commander-optimization-score-v1/
COPY --from=builder --chown=nextjs:nodejs /app/data/milestones/mechanical-space/spellbook-win-architecture-space-v1/normalized-combo-dictionary.jsonl ./data/milestones/mechanical-space/spellbook-win-architecture-space-v1/normalized-combo-dictionary.jsonl
COPY --from=builder --chown=nextjs:nodejs /app/data/milestones/catalog-shadow/catalog-semantic-visualization-v1-points.json.gz ./data/milestones/catalog-shadow/catalog-semantic-visualization-v1-points.json.gz
COPY --from=builder --chown=nextjs:nodejs /app/data/milestones/catalog-shadow/catalog-shadow-parse-rc8-firestore-v2.jsonl.gz ./data/milestones/catalog-shadow/catalog-shadow-parse-rc8-firestore-v2.jsonl.gz

USER nextjs
EXPOSE 8080

CMD ["node", "server.js"]
