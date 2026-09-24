# ==============================================================================
# Stage 1: Build & Dependency Wheel Compilation
# ==============================================================================
FROM python:3.12-slim-bookworm AS builder

# Prevent interactive prompts and Python output buffering
ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /build

# Install build dependencies required for compiling native C/C++ extensions
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency manifest
COPY requirements.txt .

# Compile wheels into an isolated directory
RUN pip wheel --no-cache-dir --no-deps --wheel-dir /build/wheels -r requirements.txt

# ==============================================================================
# Stage 2: Hardened Production Runtime
# ==============================================================================
FROM python:3.12-slim-bookworm AS runner

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000 \
    APP_USER=appuser \
    APP_UID=10001 \
    APP_GROUP=appgroup \
    APP_GID=10001

WORKDIR /app

# Install minimal runtime shared libraries only (libpq5, dumb-init, ca-certificates)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    dumb-init \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get purge -y --auto-remove

# Create deterministic unprivileged user and group
RUN groupadd -g ${APP_GID} ${APP_GROUP} && \
    useradd -u ${APP_UID} -g ${APP_GROUP} -s /sbin/nologin --no-create-home ${APP_USER}

# Install pre-built wheels from builder
COPY --from=builder /build/wheels /wheels
COPY requirements.txt .
RUN pip install --no-cache-dir --no-index --find-links=/wheels -r requirements.txt && \
    rm -rf /wheels requirements.txt

# Copy application source code with unprivileged ownership
COPY --chown=${APP_UID}:${APP_GID} ./backend /app/backend

# Allocate scratch/tmp directories for internal runtime buffering
RUN mkdir -p /app/tmp && chown -R ${APP_UID}:${APP_GID} /app/tmp

# Drop privileges to non-root user
USER ${APP_UID}:${APP_GID}

EXPOSE 8000

# Dumb-init prevents zombie process accumulation and ensures graceful SIGTERM handling
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

CMD ["gunicorn", "backend.app.main:app", \
     "--workers", "4", \
     "--worker-class", "uvicorn.workers.UvicornWorker", \
     "--bind", "0.0.0.0:8000", \
     "--timeout", "30", \
     "--keep-alive", "5", \
     "--access-logfile", "-", \
     "--error-logfile", "-"]
