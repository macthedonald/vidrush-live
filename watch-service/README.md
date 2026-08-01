# Kakkao watch-service

An **optional** frame-extraction fallback for the learn-from-video sub-agent. Gemini normally
watches YouTube links natively — it ingests the URL directly, so no download is involved and
this service isn't needed. It only comes into play when a link isn't one Gemini can open
(or it refuses): the service downloads the video, extracts scaled JPEG frames, pulls a
transcript (native captions, or Groq Whisper), and returns them for
`app-live/lib/engine/video-understanding.ts` to hand to Gemini as images. If it isn't
configured, the sub-agent falls back to reasoning from the URL alone, which it labels as
not-watched.

## Contract

```
POST /watch
  Authorization: Bearer $WATCH_SERVICE_TOKEN        (only if the token is set)
  { "url": "https://youtu.be/…", "maxFrames": 16 }
→ { "frames": ["data:image/jpeg;base64,…", …], "transcript": "…" }

GET /health → { "ok": true }
```

## Run locally

```bash
cd watch-service
docker build -t kakkao-watch .
docker run -p 8080:8080 -e GROQ_API_KEY=… -e WATCH_SERVICE_TOKEN=secret kakkao-watch
# smoke test:
curl -s localhost:8080/watch -H 'authorization: Bearer secret' \
  -H 'content-type: application/json' -d '{"url":"https://youtu.be/aqz-KE-bpKQ","maxFrames":8}' | jq '.frames|length, (.transcript|length)'
```

## Deploy (Fly.io)

```bash
cd watch-service
fly launch --copy-config --now          # app name in fly.toml; change if taken
fly secrets set WATCH_SERVICE_TOKEN=$(openssl rand -hex 24) GROQ_API_KEY=…
fly deploy
```

Also deployable to Railway / Render / any Docker host.

## Wire it into the app

Set in the app-live (Vercel) env:

| Var | Value |
|-----|-------|
| `WATCH_SERVICE_URL` | your service URL, e.g. `https://kakkao-watch.fly.dev` |
| `WATCH_SERVICE_TOKEN` | the same secret you set on the service (if any) |

With these set, `learnFromVideo` still prefers **Gemini watching the URL natively**, and only
falls back to this service's frames when that isn't possible. Either way the watching is done
by Gemini (`GEMINI_API_KEY`).

> Note on YouTube: datacenter IPs are sometimes rate-limited by YouTube. If downloads fail,
> configure yt-dlp cookies or a proxy on the host; short clips work best.
