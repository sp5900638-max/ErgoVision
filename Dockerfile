# ==============================================================================
# Multi-Stage Zero-Trust Production Dockerfile for ErgoSense 360
# Combines React SPA build + Hardened FastAPI Backend with WebSockets
# ==============================================================================

# Stage 1: Build React Frontend Production Bundle
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --prefer-offline --no-audit
COPY frontend/ ./
RUN npm run build

# Stage 2: Compile Python Dependencies Wheels
FROM python:3.12-slim-bookworm AS backend-builder
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /build
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip wheel --no-cache-dir --no-deps --wheel-dir /build/wheels -r requirements.txt

# Stage 3: Minimal Hardened Production Runtime (Zero-Trust Non-Root)
FROM python:3.12-slim-bookworm AS runner
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000 \
    APP_USER=appuser \
    APP_UID=10001 \
    APP_GROUP=appgroup \
    APP_GID=10001

WORKDIR /app

# Install minimal shared runtime libraries (libpq5, dumb-init, libgl1/glib for OpenCV)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    dumb-init \
    ca-certificates \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get purge -y --auto-remove

# Create deterministic non-root user and group
RUN groupadd -g ${APP_GID} ${APP_GROUP} && \
    useradd -u ${APP_UID} -g ${APP_GROUP} -s /sbin/nologin --no-create-home ${APP_USER}

# Install pre-built Python dependencies
COPY --from=backend-builder /build/wheels /wheels
COPY backend/requirements.txt .
RUN pip install --no-cache-dir --no-index --find-links=/wheels -r requirements.txt && \
    rm -rf /wheels requirements.txt

# Copy backend source code
COPY --chown=${APP_UID}:${APP_GID} ./backend /app/backend

# Copy compiled frontend production assets
COPY --from=frontend-builder --chown=${APP_UID}:${APP_GID} /app/frontend/dist /app/frontend/dist

# Allocate storage directories with unprivileged permissions
RUN mkdir -p /app/data /app/tmp && chown -R ${APP_UID}:${APP_GID} /app/data /app/tmp

# Drop privileges to non-root execution
USER ${APP_UID}:${APP_GID}

EXPOSE 8000

# Dumb-init prevents PID 1 zombie process hoarding and handles signals
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Automatically binds to cloud provider assigned $PORT (Render, Railway, Fly, Cloud Run, AWS)
CMD ["sh", "-c", "uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
