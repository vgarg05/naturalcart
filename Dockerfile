# ── Stage 1: Build React Frontend ─────────────────────────────────────────────
FROM node:18-alpine AS frontend-builder
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY index.html ./
COPY vite.config.js ./
COPY src/ ./src/

RUN npm run build

# ── Stage 2: Python + FastAPI ──────────────────────────────────────────────────
FROM python:3.11-slim
WORKDIR /app

# System deps required by FAISS and sentence-transformers
RUN apt-get update && apt-get install -y \
    build-essential \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first (cached layer — only re-runs if requirements change)
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend source and product catalog
COPY backend/ ./backend/

# ── Pre-generate product embeddings at BUILD TIME ──────────────────────────────
# This runs once when the Docker image is built. The resulting
# cached_embeddings.npy is baked into the image so the server starts instantly.
# The all-MiniLM-L6-v2 model (~90MB) is downloaded here once and also cached
# inside the image via HuggingFace's default cache directory.
RUN python backend/generate_embeddings.py

# Copy React build output from Stage 1
COPY --from=frontend-builder /app/dist ./dist

# Hugging Face Spaces uses port 7860
EXPOSE 7860

# Start the server — embeddings already cached, startup is instant
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "7860"]
