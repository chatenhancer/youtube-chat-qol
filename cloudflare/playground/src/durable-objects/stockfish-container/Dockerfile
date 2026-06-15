FROM python:3.12-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends stockfish ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY server.py /app/server.py

ENV PORT=8080
ENV STOCKFISH_PATH=/usr/games/stockfish

EXPOSE 8080
CMD ["python", "/app/server.py"]
