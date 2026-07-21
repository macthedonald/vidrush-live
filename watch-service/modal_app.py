# Vidrush watch-service on Modal.com
# Run `pip install modal` and `modal deploy modal_app.py` to deploy for free.

import base64
import glob
import os
import subprocess
import tempfile
import modal

# Define Modal Image with ffmpeg and yt-dlp installed
image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg", "ca-certificates", "curl")
    .run_commands(
        "curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp",
        "chmod a+rx /usr/local/bin/yt-dlp"
    )
)

app = modal.App("vidrush-watch-service")

@app.function(image=image, timeout=300)
@modal.web_endpoint(method="POST")
def watch(data: dict):
    url = data.get("url")
    if not url:
        return {"error": "url required"}, 400

    max_frames = int(data.get("maxFrames") or 16)

    with tempfile.TemporaryDirectory() as workdir:
        # 1. Download video with yt-dlp
        out_pattern = os.path.join(workdir, "video.%(ext)s")
        subprocess.run(["yt-dlp", "-f", "mp4/best", "--no-playlist", "-o", out_pattern, url], check=True)
        vids = [f for f in glob.glob(os.path.join(workdir, "video.*")) if not f.endswith((".vtt", ".srt"))]
        if not vids:
            return {"error": "download produced no video file"}, 500
        video = vids[0]

        # 2. Probe duration & extract frames
        r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", video], capture_output=True, text=True)
        dur = float(r.stdout.strip() or 1.0)
        fps = max(0.1, min(1.0, max_frames / max(dur, 1.0)))
        pat = os.path.join(workdir, "frame_%03d.jpg")
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", video, "-vf", f"fps={fps},scale=-2:360", "-frames:v", str(max_frames), pat], check=True)

        frames = []
        for f in sorted(glob.glob(os.path.join(workdir, "frame_*.jpg")))[:max_frames]:
            with open(f, "rb") as fh:
                frames.append("data:image/jpeg;base64," + base64.b64encode(fh.read()).decode())

        # 3. Extract transcript
        transcript = ""
        try:
            subprocess.run(["yt-dlp", "--skip-download", "--write-auto-sub", "--write-sub", "--sub-lang", "en", "--convert-subs", "srt", "-o", os.path.join(workdir, "cap.%(ext)s"), url], check=True)
            srts = glob.glob(os.path.join(workdir, "*.srt"))
            if srts:
                with open(srts[0], encoding="utf-8", errors="ignore") as fh:
                    lines = [ln.strip() for ln in fh if ln.strip() and not ln.strip().isdigit() and "-->" not in ln]
                    transcript = " ".join(lines)[:20000]
        except Exception:
            pass

        return {"frames": frames, "transcript": transcript}
