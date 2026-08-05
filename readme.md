# VidRush Live

A small monorepo powering a live/video studio and rendering pipeline: a Next.js frontend + Remotion rendering, Drizzle-managed database migrations/schemas, and a set of Python microservices (avatar / watch) and browser hook utilities used to assemble, process, and monitor live video assets.

Key use-cases: interactive live previews, rendering short Remotion videos, managing media library metadata, and running auxiliary services for avatars and watchers.

## Stack
- Language(s): TypeScript / JavaScript (Next.js app), Python (microservices & workers)
- Framework / runtime: Next.js (App Router) + Remotion for video rendering
- Notable libraries/tools: Drizzle (migrations/schema), Remotion, Vitest (tests), Docker / docker-compose, Bun/npm (lockfiles present)

## Repo layout
Top-level entries (important ones shown, trimmed for clarity):

```
.env.md                 # environment variable reference for the whole project
app-live/               # main Next.js + Remotion app (frontend, API routes, migrations)
  Dockerfile
  docker-compose.yaml
  next.config.mjs
  app/                   # Next app directory (layout.tsx, page.tsx, css, api/)
  remotion/              # Remotion video components & config
  drizzle/               # SQL migrations and schema (schema.ts + migrations/*.sql)
  package.json
  .env.local.example
avatar-service/         # Python "modal" app for avatar processing (modal_app.py, requirements.txt)
hook/                   # Browser hook / embed (index.html, meta.json, hyperframes.json)
spike/                  # experimental scripts for ffmpeg / asset generation (render-ffmpeg.mjs, storyboard.json)
watch-service/          # Python watch/monitor service (server.py, modal_app.py, fly.toml)
package.json            # top-level orchestrator (runs scripts inside app-live)
package-lock.json
```

How it fits together:
- app-live is the primary runtime: a Next.js site serving UI, API endpoints, and running Remotion renders. Drizzle files under app-live/drizzle define DB schema and migrations used by the app backend.
- Python services (avatar-service, watch-service) run alongside the app to perform media/processing tasks or provide external integrations. The hook directory contains a small client that can be embedded in other pages to integrate live features.
- spike contains utility scripts and experiments (ffmpeg rendering, storyboard assets) used to generate or test video assets.

## Getting started — local development

Prerequisites:
- Node.js (or Bun) and npm (or Bun) for app-live
- Python 3.8+ + pip for Python services
- Docker & docker-compose (optional, recommended for running components together)
- See ENV.md for a full list of required environment variables.

1) Clone and prepare
```
git clone https://github.com/macthedonald/vidrush-live.git
cd vidrush-live
```

2) Frontend / app-live (development)
```
cd app-live
# install
npm ci
# or: bun install (if using Bun)
# start dev server
npm run dev
# build for production
npm run build
# run production locally
npm run start
```
- Copy config: `cp .env.local.example .env.local` and fill in required secrets. See ENV.md for details.

3) Running with Docker (app + services)
- app-live contains docker-compose.yaml; from repo root:
```
cd app-live
docker compose up --build
```
This will build and start containers defined in app-live/docker-compose.yaml (check that image/service names and required environment variables are set).

4) Python microservices
- avatar-service:
```
cd avatar-service
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python modal_app.py
```
- watch-service:
```
cd watch-service
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt   # if present
python server.py
```
Configuration for deployment targets (e.g., Fly) can be found in watch-service/fly.toml.

5) Database / migrations
- Drizzle schema and SQL migrations live under app-live/drizzle. Follow your usual Drizzle + DB workflow to run migrations (see app-live/drizzle and drizzle.config.ts for DB connection settings).

6) Tests
```
cd app-live
npm run test        # runs Vitest (configured in vitest.config.mts)
```

## Useful files
- app-live/app/layout.tsx, app-live/app/page.tsx — main Next.js app entry/layout and top-level page
- app-live/remotion/ & remotion.config.ts — Remotion components & render config
- app-live/drizzle/schema.ts and app-live/drizzle/*.sql — database schema + migrations
- app-live/.env.local.example — example env vars for frontend/backend
- ENV.md — consolidated environment variables reference for the repo
- avatar-service/modal_app.py, watch-service/server.py — Python service entrypoints
- hook/index.html — small hook/embed client for third-party pages
- spike/render-ffmpeg.mjs — experimental ffmpeg rendering script and assets

## Development notes & conventions
- The repository includes both npm and bun lockfiles (package-lock.json and bun.lock). Use the package manager your environment supports or as specified in CI.
- Remotion is used to generate video output; renders can be invoked from the Remotion CLI or via the app’s server-side endpoints (see remotion config & scripts).
- Database schema is managed with Drizzle; migrations are the SQL files under app-live/drizzle.

## Contributing
Read app-live/CONTRIBUTING.md for contribution guidelines and CODE_OF_CONDUCT.md in app-live for community expectations. For architecture decisions or agent workflows, see AGENTS.md files in the relevant subfolders.

## License
See app-live/LICENSE for license details.

## Try asking
- How do I run a Remotion render from the server — which endpoint in app-live/api calls the Remotion renderer?
- What tables and relations are defined in app-live/drizzle/schema.ts and which migration creates the media library tables?
- How should I deploy watch-service using watch-service/fly.toml and what environment variables must be provided (refer to ENV.md)?

If you want, I can produce a ready-to-commit README.md file matching this content (with optional badges and setup examples for specific hosts like Vercel or Fly).
