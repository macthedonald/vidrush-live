# Vidrush MuseTalk Talking Avatar Service (Modal.com)

Real-time audio-driven talking avatar / A-roll synthesis powered by **MuseTalk** on Modal.com GPUs.

## Features
- **Audio-Driven Lip Sync**: Synthesizes synchronized presenter video from narration audio (`audio_url`).
- **Custom Presenter Portraits**: Takes any custom avatar image (`avatar_image_url`) or uses a default high-quality presenter portrait.
- **Modal GPU Hosting**: Powered by NVIDIA A10G GPUs with auto-scaling on Modal.com.

## How to Deploy on Modal.com

1. Install Modal CLI:
   ```bash
   pip install modal
   modal setup
   ```

2. Deploy to Modal:
   ```bash
   cd avatar-service
   modal deploy modal_app.py
   ```

3. Copy the Modal deployment URL (e.g. `https://<username>--vidrush-avatar-service-fastapi-app.modal.run`) and set it in your environment variables:
   ```env
   AVATAR_SERVICE_URL=https://<username>--vidrush-avatar-service-fastapi-app.modal.run
   ```

## Endpoint Schema

`POST /generate_avatar` (or `POST /`)

**Request Body (JSON)**:
```json
{
  "audio_url": "https://example.com/narration.mp3",
  "avatar_image_url": "https://images.unsplash.com/photo-1534528741775-53994a69daeb",
  "bbox_shift": 0,
  "fps": 25
}
```

**Response Body (JSON)**:
```json
{
  "status": "success",
  "model": "MuseTalk-v1.0 (Modal)",
  "video_url": "data:video/mp4;base64,...",
  "duration": 12.5,
  "avatar_image_url": "https://...",
  "fps": 25
}
```
