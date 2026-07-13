# VidRush render worker

The tier-1 ffmpeg renderer behind an HTTP endpoint, deployed to **Fly.io**. Vercel's
`composeRender` tool calls this instead of shelling out to ffmpeg itself — Vercel's
serverless functions have no ffmpeg binary and tight time/size limits, so every heavy
render second happens here.

The render engine (`src/render.ts`) is **vendored** from `app-live/lib/engine/render.ts`
so the worker builds standalone. It is byte-identical; regenerate after any engine change:

```bash
npm run sync:engine
```

## Endpoints

- `GET /health` → `{ ok: true }`
- `POST /render` (Bearer `RENDER_WORKER_TOKEN` if set)
  ```json
  { "input": { "width": 1280, "height": 720, "fps": 30,
               "brand": { "accent": "#ff2d55" },
               "shots": [ { "kind": "photo", "src": "https://…", "start": 0,
                           "duration": 3.2, "words": [ { "word": "Ever", "start": 0.05, "end": 0.32 } ] } ],
               "voice": "https://…/voice.mp3", "music": "https://…/music.mp3" },
    "key": "renders/abc.mp4" }
  ```
  Returns `{ url, totalSeconds, shots, hadVoice, hadMusic, fallbacks }` when storage is
  configured, otherwise streams the MP4 back inline.

## Environment

| Var | Purpose |
|-----|---------|
| `RENDER_WORKER_TOKEN` | Bearer token required on `/render` (set the same value in the Vercel app). |
| `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Object storage credentials (Cloudflare R2 / AWS S3 / Supabase S3). |
| `R2_ACCOUNT_ID` **or** `S3_ENDPOINT` | R2 account id (endpoint auto-derived) or an explicit S3 endpoint. |
| `S3_REGION` | Defaults to `auto` (correct for R2). |
| `S3_PUBLIC_BASE_URL` | Public base URL for uploaded objects, e.g. your R2 public bucket / CDN domain. |
| `FFMPEG_PATH` | Optional; defaults to `ffmpeg` on `PATH` (installed in the image). |

If no `S3_*` bucket is set, `/render` streams the MP4 back inline instead of uploading —
handy for a first smoke test before wiring storage.

## Deploy

```bash
# one-time
fly launch --no-deploy --copy-config --name vidrush-render   # or: fly apps create vidrush-render

# secrets
fly secrets set RENDER_WORKER_TOKEN=… \
  S3_BUCKET=… S3_ACCESS_KEY_ID=… S3_SECRET_ACCESS_KEY=… \
  R2_ACCOUNT_ID=… S3_PUBLIC_BASE_URL=https://cdn.example.com

# ship it
fly deploy
```

Then in the Vercel app set `RENDER_WORKER_URL=https://vidrush-render.fly.dev` (and the
matching `RENDER_WORKER_TOKEN`). `composeRender` will POST renders here and return the
resulting MP4 URL.

## Local dev

```bash
npm install
npm run sync:engine
npm run dev            # http://localhost:8080
```
