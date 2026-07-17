# Kakkao — environment variables

Everything you need to set, grouped by **where** it goes. Three targets:

1. **Vercel → app-live project** (the chat app + Studio + Niche Finder + sub-agents)
2. **watch-service** (Fly/Docker — only if you want Claude to watch videos)
3. **GitHub repo secrets** (only for the one-click Remotion Lambda deploy Action)

Legend: **[req]** required for that feature to work · **[opt]** optional / tuning.

---

## 1) Vercel — `app-live` project env

### Core (the app won't run without these)

```bash
DATABASE_URL=postgresql://user:pass@host:5432/kakkao   # [req] Postgres (chat history, feedback)
ANTHROPIC_API_KEY=sk-ant-…        # [req] scripts, beats, niche AI, learn-from-video (Claude)
TAVILY_API_KEY=tvly-…             # [req] research + footage discovery (default search provider)
# At least one more general AI provider is used as the chat default:
OPENAI_API_KEY=sk-…               # [req] unless you set another default provider below
```

> **Redis is effectively required for the Studio flow.** `composeRender` stores the
> storyboard in KV and `/studio/[id]` reads it back; on Vercel's serverless the in-memory
> fallback does NOT persist between requests, so set Upstash:
>
> ```bash
> UPSTASH_REDIS_REST_URL=https://….upstash.io   # [req for Studio] storyboard + voiceover KV
> UPSTASH_REDIS_REST_TOKEN=…                     # [req for Studio]
> ```

### Media generation — AI33 (voice, music, images, thumbnails)

```bash
AI33_API_KEY=…                    # [req] TTS, voice cloning, Suno music, gpt-image-2, nano-banana-pro
AI33_BASE_URL=https://api.ai33.pro          # [opt] default shown
AI33_VOICE_ID=elevenlabs_21m00Tcm4TlvDq8ikWAM   # [opt] house voice
AI33_IMAGE_MODEL=gpt-image-2                 # [opt] frame model (confirm via GET /v1i/models)
AI33_THUMBNAIL_MODEL=nano-banana-pro         # [opt] thumbnail model
AI33_IMAGE_TASK_PATH=/v1i/task/generate-image # [opt] override if the API path differs
```

### Video render — Remotion Lambda

```bash
REMOTION_SERVE_URL=https://remotionlambda-….s3….amazonaws.com/sites/kakkao/index.html  # [req to render]
REMOTION_AWS_ACCESS_KEY_ID=…      # [req to render] (or reuse AWS_ACCESS_KEY_ID)
REMOTION_AWS_SECRET_ACCESS_KEY=…  # [req to render] (or reuse AWS_SECRET_ACCESS_KEY)
REMOTION_LAMBDA_REGION=us-east-1  # [opt] default us-east-1
REMOTION_FUNCTION_NAME=…          # [opt] else derived from memory/disk/timeout
REMOTION_LAMBDA_MEMORY=2048       # [opt]
REMOTION_LAMBDA_DISK=2048         # [opt]
REMOTION_LAMBDA_TIMEOUT=240       # [opt]
REMOTION_RENDER_PRIVACY=public    # [opt] public | private
REMOTION_OUTPUT_BUCKET=…          # [opt] explicit S3 output bucket
```

> Without these, `composeRender` still works — it publishes the storyboard and the Studio
> preview loads — you just can't click **Render on Lambda** yet.

### Niche Finder (`/niche`)

```bash
YOUTUBE_API_KEY=AIza…             # [req for Niche Finder] YouTube Data API v3 (also CC footage search)
NICHE_AI_MODEL=anthropic:claude-sonnet-5   # [opt] model for sub-niche ideas + verdicts
```

### Learn-from-video sub-agent

```bash
# Fallback path (always available): Gemini reads the YouTube URL directly.
GEMINI_API_KEY=…                  # [req unless watch-service] or reuse GOOGLE_GENERATIVE_AI_API_KEY
LEARN_VIDEO_GEMINI_MODEL=gemini-2.5-flash   # [opt]
# Primary path (Claude watches frames) — point at your deployed watch-service:
WATCH_SERVICE_URL=https://kakkao-watch.fly.dev   # [opt] enables Claude-first watching
WATCH_SERVICE_TOKEN=…             # [opt] must match the service's token
LEARN_VIDEO_CLAUDE_MODEL=anthropic:claude-sonnet-5   # [opt]
```

### Footage sources (optional — Wikimedia + Internet Archive need no key)

```bash
PEXELS_API_KEY=…      # [opt]
PIXABAY_API_KEY=…     # [opt]
COVERR_API_KEY=…      # [opt]
NARA_API_KEY=…        # [opt] U.S. National Archives
```

### Other AI providers (optional — any one can be the chat default)

```bash
GOOGLE_GENERATIVE_AI_API_KEY=…    # [opt] Gemini via the SDK (doubles as learn-video key)
AI_GATEWAY_API_KEY=…              # [opt] Vercel AI Gateway
OLLAMA_BASE_URL=http://localhost:11434              # [opt]
OPENAI_COMPATIBLE_API_KEY=…       # [opt] DeepSeek/Moonshot/etc.
OPENAI_COMPATIBLE_API_BASE_URL=…  # [opt]
OPENAI_COMPATIBLE_MODELS=…        # [opt] comma-separated whitelist
OPENAI_COMPATIBLE_PROVIDER_NAME=… # [opt] UI label
```

### Auth — Supabase (optional; default is anonymous single-user)

```bash
ENABLE_AUTH=false                 # [opt] true to require sign-in
ANONYMOUS_USER_ID=anonymous-user  # [opt]
NEXT_PUBLIC_SUPABASE_URL=…        # [req if ENABLE_AUTH=true]
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=…   # [req if ENABLE_AUTH=true]
SUPABASE_SECRET_KEY=…             # [req for account deletion] never expose to the browser
```

### File uploads — Cloudflare R2 / S3 (optional)

```bash
R2_ACCOUNT_ID=…      R2_ACCESS_KEY_ID=…      R2_SECRET_ACCESS_KEY=…     # [opt]
R2_BUCKET_NAME=user-uploads      R2_PUBLIC_URL=…       S3_ENDPOINT=…    # [opt]
```

### Alt search & extraction (optional)

```bash
SEARCH_API=tavily                 # [opt] tavily | searxng | exa | firecrawl
EXA_API_KEY=…   FIRECRAWL_API_KEY=…   BRAVE_SEARCH_API_KEY=…   JINA_API_KEY=…   # [opt]
SEARXNG_API_URL=…                 # [opt] + other SEARXNG_* if self-hosting
```

### Analytics / observability (optional)

```bash
NEXT_PUBLIC_POSTHOG_KEY=…   NEXT_PUBLIC_POSTHOG_HOST=…    # [opt]
ENABLE_LANGFUSE_TRACING=…   LANGFUSE_SECRET_KEY=…   LANGFUSE_PUBLIC_KEY=…   # [opt]
```

---

## 2) watch-service (Fly.io / Docker) — only for Claude-first video watching

```bash
WATCH_SERVICE_TOKEN=<openssl rand -hex 24>   # [opt] shared secret; must equal WATCH_SERVICE_URL's token in app-live
GROQ_API_KEY=gsk_…                            # [opt] Whisper transcript when captions are missing
PORT=8080                                     # [opt] default 8080
```

Set with `fly secrets set …`. See `watch-service/README.md`.

---

## 3) GitHub repo secrets — only for the "Deploy Remotion Lambda" Action

```bash
REMOTION_AWS_ACCESS_KEY_ID=…      # [req for the Action]
REMOTION_AWS_SECRET_ACCESS_KEY=…  # [req for the Action]
```

The Action prints the `REMOTION_SERVE_URL` to paste into the Vercel env above.

---

## Minimum to light up the whole video pipeline

`DATABASE_URL` · `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` · `ANTHROPIC_API_KEY` ·
`TAVILY_API_KEY` · `AI33_API_KEY` · `YOUTUBE_API_KEY` · `GEMINI_API_KEY` ·
`REMOTION_SERVE_URL` + `REMOTION_AWS_ACCESS_KEY_ID` + `REMOTION_AWS_SECRET_ACCESS_KEY`
(+ one general provider like `OPENAI_API_KEY` for the chat default).
