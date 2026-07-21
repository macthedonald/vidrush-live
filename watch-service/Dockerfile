# Kakkao watch-service — yt-dlp + ffmpeg + a tiny stdlib HTTP server. No pip deps.
FROM python:3.12-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl \
  && rm -rf /var/lib/apt/lists/* \
  && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app
COPY server.py .

ENV PORT=7860
EXPOSE 7860
CMD ["python", "server.py"]
