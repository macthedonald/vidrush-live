# Video rendering — Remotion + Remotion Lambda

Kakkao renders finished videos with **[Remotion](https://remotion.dev)**. The storyboard
(shots + resolved footage + word-timed captions + voiceover + music) is a React composition
(`remotion/Storyboard.tsx`). The **exact same composition**:

- previews interactively in the chat via `@remotion/player` (`components/remotion-preview.tsx`),
  so what you scrub is what you get; and
- renders to an MP4 on **Remotion Lambda** — frames fan out across concurrent Lambda
  invocations, so a render is fast and there is no long-running server to babysit.

This replaced the previous two-tier FFmpeg design (a Fly.io worker shelling out to `ffmpeg`).
There is no ffmpeg binary or render worker anymore.

## Architecture

```
cutBeats + sourceFootage + generateVoiceover + generateMusic
        │  (shots, asset URLs, word timings, audio URLs)
        ▼
composeRender tool ──build──► StoryboardInput  (remotion/schema.ts — the one shared shape)
        │                         │
        │                         └──► <Player> preview in chat  (WYSIWYG)
        ▼
renderStoryboardOnLambda ──► Remotion Lambda ──► MP4 URL (S3)
```

- Composition: `remotion/Storyboard.tsx` (Ken Burns stills, cover-fit clips, crossfades,
  karaoke captions, ducked voice+music mix; missing assets → clean accent cards).
- Registry: `remotion/Root.tsx` / `remotion/index.ts` (`registerRoot`).
- Lambda wrapper: `lib/remotion/lambda.ts` (`renderStoryboardOnLambda`, progress polling).
- Tool: `lib/tools/video/compose-render.ts`.

## One-time deploy

Prerequisites: an AWS account and the AWS credentials below. All `@remotion/*` packages must
be the **same version** (they are, via `package.json`).

1. **Create an IAM user + role for Remotion** following the official policy generator:
   https://www.remotion.dev/docs/lambda/setup — it produces a user policy and a role policy.
   Put the user's keys in the app env (see below).

2. **Deploy the Lambda function** (sets its memory/disk/timeout — keep these in sync with the
   `REMOTION_LAMBDA_*` env vars so the function name resolves):

   ```bash
   cd app-live
   npx remotion lambda functions deploy \
     --memory=2048 --disk=2048 --timeout=240
   ```

3. **Deploy the site bundle** (bundles `remotion/index.ts` and uploads it to S3). The printed
   `Serve URL` is your `REMOTION_SERVE_URL`:

   ```bash
   npx remotion lambda sites create remotion/index.ts --site-name=kakkao
   # or: bun run remotion:lambda:site
   ```

   Re-run this (same `--site-name`) after **any** change to the composition to publish it.

## App environment

Set these in the app (Vercel project env or `.env.local`):

| Var | Purpose |
|-----|---------|
| `REMOTION_AWS_ACCESS_KEY_ID` | Remotion IAM user access key (or reuse `AWS_ACCESS_KEY_ID`). |
| `REMOTION_AWS_SECRET_ACCESS_KEY` | Remotion IAM user secret (or `AWS_SECRET_ACCESS_KEY`). |
| `REMOTION_LAMBDA_REGION` | AWS region, e.g. `us-east-1` (default). |
| `REMOTION_SERVE_URL` | Serve URL from `sites create` — **required** to render. |
| `REMOTION_FUNCTION_NAME` | Deployed function name. Optional — derived from the memory/disk/timeout vars if unset. |
| `REMOTION_LAMBDA_MEMORY` / `_DISK` / `_TIMEOUT` | Match the `functions deploy` flags (defaults 2048/2048/240). |
| `REMOTION_RENDER_PRIVACY` | `public` (default) or `private` output objects. |
| `REMOTION_OUTPUT_BUCKET` | Optional explicit S3 bucket for outputs. |

> Remotion reads `REMOTION_AWS_*` first, then falls back to standard `AWS_*` credentials.

If `REMOTION_SERVE_URL` + credentials are **not** set, `composeRender` still returns the
storyboard so the in-chat Remotion preview works — it just can't produce the final MP4 yet.

## Local development

```bash
cd app-live
bun install
bun run remotion:studio                 # open Remotion Studio to iterate on the composition
bun run remotion:render                 # render the default props to out/video.mp4 (needs a local ffmpeg via Remotion)
```

The Studio and the in-app `<Player>` render the identical composition, so iterate in either.

## Why Remotion Lambda over HyperFrames

- **Embeddable, WYSIWYG preview**: `@remotion/player` drops the *same* composition into this
  Next.js chat UI; HyperFrames' preview is a CLI/dev server you can't embed here.
- **Self-hosted serverless render in your own AWS**: Remotion Lambda deploys into your
  account. HyperFrames rendering is HeyGen-hosted — there is no "HyperFrames Lambda" you run
  in your own cloud.
- **One language, one source of truth**: the composition is React/TS inside `app-live`;
  preview and render share `remotion/schema.ts`, guaranteeing parity.
