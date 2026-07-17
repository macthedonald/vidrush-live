# Kakkao watch service — the frame-extraction backend for the learn-from-video sub-agent's
# CLAUDE path. Vercel serverless can't run yt-dlp/ffmpeg, so this small service does it and
# returns frames + transcript that app-live's lib/engine/video-understanding.ts hands to
# Claude. Contract:
#   POST /watch  { "url": "<youtube-or-any-url>", "detail"?: "efficient"|"scene", "maxFrames"?: 16 }
#     → { "frames": ["data:image/jpeg;base64,…", …], "transcript": "…" }
#   Optional auth: Authorization: Bearer $WATCH_SERVICE_TOKEN
#   GET /health → { "ok": true }
import base64
import glob
import json
import os
import subprocess
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOKEN = os.environ.get("WATCH_SERVICE_TOKEN", "")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
PORT = int(os.environ.get("PORT", "8080"))


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, capture_output=True, text=True, **kw)


def download(url, workdir):
    out = os.path.join(workdir, "video.%(ext)s")
    run(["yt-dlp", "-f", "mp4/best", "--no-playlist", "-o", out, url])
    files = glob.glob(os.path.join(workdir, "video.*"))
    vids = [f for f in files if not f.endswith((".vtt", ".srt"))]
    if not vids:
        raise RuntimeError("download produced no video file")
    return vids[0]


def extract_frames(video, workdir, max_frames):
    # Even-interval keyframes, scaled down (auto width, height 360) for cheap vision.
    pat = os.path.join(workdir, "frame_%03d.jpg")
    dur = probe_duration(video)
    fps = max(0.1, min(1.0, max_frames / max(dur, 1)))
    run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", video,
        "-vf", f"fps={fps},scale=-2:360", "-frames:v", str(max_frames), pat,
    ])
    frames = sorted(glob.glob(os.path.join(workdir, "frame_*.jpg")))[:max_frames]
    out = []
    for f in frames:
        with open(f, "rb") as fh:
            out.append("data:image/jpeg;base64," + base64.b64encode(fh.read()).decode())
    return out


def probe_duration(video):
    try:
        r = run([
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", video,
        ])
        return float(r.stdout.strip() or 0)
    except Exception:
        return 0.0


def get_transcript(url, video, workdir):
    # 1) Native captions via yt-dlp (fast, free).
    try:
        run([
            "yt-dlp", "--skip-download", "--write-auto-sub", "--write-sub",
            "--sub-lang", "en", "--convert-subs", "srt",
            "-o", os.path.join(workdir, "cap.%(ext)s"), url,
        ])
        srts = glob.glob(os.path.join(workdir, "*.srt"))
        if srts:
            return srt_to_text(srts[0])
    except Exception:
        pass
    # 2) Whisper via Groq (if a key is set) on extracted audio.
    if GROQ_API_KEY:
        try:
            audio = os.path.join(workdir, "audio.mp3")
            run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", video,
                 "-vn", "-ac", "1", "-ar", "16000", audio])
            return groq_whisper(audio)
        except Exception:
            pass
    return ""


def srt_to_text(path):
    lines = []
    with open(path, encoding="utf-8", errors="ignore") as fh:
        for ln in fh:
            ln = ln.strip()
            if not ln or ln.isdigit() or "-->" in ln:
                continue
            lines.append(ln)
    return " ".join(lines)[:20000]


def groq_whisper(audio_path):
    import urllib.request
    boundary = "----kakkaowatch"
    with open(audio_path, "rb") as fh:
        audio = fh.read()
    parts = []
    parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-large-v3-turbo\r\n')
    parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\ntext\r\n')
    pre = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.mp3"\r\n'
           'Content-Type: audio/mpeg\r\n\r\n').encode()
    body = "".join(parts).encode() + pre + audio + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(
        "https://api.groq.com/openai/v1/audio/transcriptions",
        data=body,
        headers={
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read().decode()[:20000]


class Handler(BaseHTTPRequestHandler):
    def _json(self, code, obj):
        payload = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path == "/health":
            return self._json(200, {"ok": True})
        return self._json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/watch":
            return self._json(404, {"error": "not found"})
        if TOKEN:
            auth = self.headers.get("authorization", "")
            if auth != f"Bearer {TOKEN}":
                return self._json(401, {"error": "unauthorized"})
        try:
            length = int(self.headers.get("content-length", "0"))
            body = json.loads(self.rfile.read(length) or b"{}")
        except Exception:
            return self._json(400, {"error": "invalid JSON"})
        url = body.get("url")
        if not url:
            return self._json(400, {"error": "url required"})
        max_frames = int(body.get("maxFrames") or 16)
        try:
            with tempfile.TemporaryDirectory() as workdir:
                video = download(url, workdir)
                frames = extract_frames(video, workdir, max_frames)
                transcript = get_transcript(url, video, workdir)
            return self._json(200, {"frames": frames, "transcript": transcript})
        except subprocess.CalledProcessError as e:
            return self._json(500, {"error": f"tool failed: {(e.stderr or '')[:400]}"})
        except Exception as e:
            return self._json(500, {"error": str(e)[:400]})

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    print(f"kakkao watch-service on :{PORT}")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
