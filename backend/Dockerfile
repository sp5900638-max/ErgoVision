# ==============================================================================
# Hardened Production Runtime for Backend Service
# ==============================================================================
FROM python:3.12-slim-bookworm AS runner

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=8000 \
    APP_USER=appuser \
    APP_UID=10001 \
    APP_GROUP=appgroup \
    APP_GID=10001

WORKDIR /app

# Install minimal runtime shared libraries only (libpq5, dumb-init, libgl1, libglib2.0-0, ca-certificates)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    dumb-init \
    ca-certificates \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get purge -y --auto-remove

# Create deterministic unprivileged user and group
RUN groupadd -g ${APP_GID} ${APP_GROUP} && \
    useradd -u ${APP_UID} -g ${APP_GROUP} -s /sbin/nologin --no-create-home ${APP_USER}

# Install Python dependencies directly
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code with unprivileged ownership
COPY --chown=${APP_UID}:${APP_GID} ./backend /app/backend

# Allocate scratch/tmp directories for internal runtime buffering
RUN mkdir -p /app/tmp /app/data && chown -R ${APP_UID}:${APP_GID} /app/tmp /app/data

# Drop privileges to non-root user
USER ${APP_UID}:${APP_GID}

EXPOSE 8000

# Dumb-init prevents zombie process accumulation and ensures graceful SIGTERM handling
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

CMD ["sh", "-c", "uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
