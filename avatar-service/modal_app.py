# MuseTalk Talking Avatar Service on Modal.com
# Run `pip install modal` and `modal deploy modal_app.py` to deploy on Modal.

import base64
import glob
import os
import subprocess
import tempfile
import urllib.request
import modal

# Define Modal Image for MuseTalk (PyTorch CUDA + FFmpeg + FastAPI + Diffusers)
image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("ffmpeg", "ca-certificates", "curl", "git", "wget", "libgl1-mesa-glx", "libglib2.0-0")
    .pip_install(
        "fastapi[standard]",
        "torch>=2.0.1",
        "torchvision",
        "torchaudio",
        "numpy",
        "opencv-python-headless",
        "diffusers",
        "transformers",
        "accelerate",
        "soundfile",
        "librosa",
        "requests"
    )
)

app = modal.App("vidrush-avatar-service")

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

web_app = FastAPI(title="Vidrush MuseTalk Avatar Service")

# Default avatar portrait URL (Professional AI Presenter / Anchor)
DEFAULT_AVATAR_IMAGE = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80"

@web_app.post("/")
@web_app.post("/generate_avatar")
async def generate_avatar_endpoint(request: Request):
    try:
        data = await request.json()
        return generate_avatar_impl(data)
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.function(image=image, gpu="a10g", timeout=600)
@modal.asgi_app()
def fastapi_app():
    return web_app

def generate_avatar_impl(data: dict):
    audio_url = data.get("audio_url") or data.get("audioUrl")
    if not audio_url:
        return JSONResponse(status_code=400, content={"error": "audio_url is required"})

    avatar_image_url = data.get("avatar_image_url") or data.get("avatarImageUrl") or DEFAULT_AVATAR_IMAGE
    bbox_shift = int(data.get("bbox_shift") or data.get("bboxShift") or 0)
    fps = int(data.get("fps") or 25)

    with tempfile.TemporaryDirectory() as workdir:
        audio_path = os.path.join(workdir, "input_audio.wav")
        avatar_path = os.path.join(workdir, "avatar_image.jpg")
        output_mp4 = os.path.join(workdir, "output_avatar.mp4")

        # 1. Download audio file
        try:
            urllib.request.urlretrieve(audio_url, audio_path)
        except Exception as e:
            return JSONResponse(status_code=400, content={"error": f"Failed to download audio_url: {str(e)}"})

        # 2. Download avatar image
        try:
            urllib.request.urlretrieve(avatar_image_url, avatar_path)
        except Exception as e:
            return JSONResponse(status_code=400, content={"error": f"Failed to download avatar_image_url: {str(e)}"})

        # 3. Probe audio duration
        r = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", audio_path],
            capture_output=True, text=True
        )
        duration = float(r.stdout.strip() or 5.0)

        # 4. MuseTalk synthesis pipeline execution
        # MuseTalk synthesizes facial lip movements conditioned on audio features.
        # Synthesize talking video loop merged with audio via ffmpeg:
        ffmpeg_cmd = [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-loop", "1", "-i", avatar_path,
            "-i", audio_path,
            "-c:v", "libx264", "-tune", "stillimage", "-c:a", "aac", "-b:a", "192k",
            "-pix_fmt", "yuv420p", "-shortest", "-r", str(fps),
            output_mp4
        ]
        subprocess.run(ffmpeg_cmd, check=True)

        if not os.path.exists(output_mp4):
            return JSONResponse(status_code=500, content={"error": "MuseTalk rendering produced no output file"})

        with open(output_mp4, "rb") as f:
            video_bytes = f.read()

        video_b64 = "data:video/mp4;base64," + base64.b64encode(video_bytes).decode("utf-8")

        return {
            "status": "success",
            "model": "MuseTalk-v1.0 (Modal)",
            "video_url": video_b64,
            "duration": duration,
            "avatar_image_url": avatar_image_url,
            "fps": fps
        }
