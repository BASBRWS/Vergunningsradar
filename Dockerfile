FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 DB_PATH=/data/radar.sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends tzdata && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend /app/backend
COPY web/tender-contract.json /app/backend/tender-contract.json
RUN groupadd -g 10001 radar && useradd -u 10001 -g radar radar && mkdir /data && chown radar:radar /data
USER radar
EXPOSE 8080
CMD ["python", "-m", "backend.server"]
