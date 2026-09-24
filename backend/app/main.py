"""FastAPI application entrypoint for the posture monitor system."""
from contextlib import asynccontextmanager
from pathlib import Path
import logging
import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from .api.endpoints import router as api_router
from .api.websocket import router as ws_router
from .core.state import get_tracker
from .db.database import Base, engine
from .db import models  # Ensure models are imported for metadata creation

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("posture_monitor")

# Resolved path to compiled frontend production build
FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handles startup initialization and graceful shutdown."""
    logger.info("Initializing Posture Monitor Backend service...")
    Base.metadata.create_all(bind=engine)
    logger.info("SQLite database tables verified/created.")
    yield
    logger.info("Shutting down Posture Monitor Backend service...")
    tracker = get_tracker()
    tracker.close()


app = FastAPI(
    title="Real-Time Posture Monitor API",
    description="Decoupled backend service providing computer vision pose tracking and posture evaluation.",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS Configuration
env_origins = os.getenv("ALLOWED_ORIGINS")
if env_origins:
    origins = [orig.strip() for orig in env_origins.split(",") if orig.strip()]
else:
    origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "*",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register REST and WebSocket routers
app.include_router(api_router)
app.include_router(ws_router)

# Mount frontend static assets if built
if FRONTEND_DIST.exists():
    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/")
    async def serve_root():
        """Serves the integrated React SPA."""
        index_file = FRONTEND_DIST / "index.html"
        if index_file.is_file():
            return FileResponse(str(index_file))
        return {
            "service": "Posture Monitor Backend",
            "status": "online",
            "docs_url": "/docs",
        }

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """SPA fallback handler for client-side routing and static files."""
        # Never intercept API, documentation or WebSocket routes
        if full_path.startswith(("api", "ws", "docs", "openapi.json")):
            raise HTTPException(status_code=404, detail="Not Found")

        file_candidate = FRONTEND_DIST / full_path
        if full_path and file_candidate.is_file():
            return FileResponse(str(file_candidate))

        index_file = FRONTEND_DIST / "index.html"
        if index_file.is_file():
            return FileResponse(str(index_file))

        raise HTTPException(status_code=404, detail="Not Found")
else:
    @app.get("/")
    def root():
        """Fallback service status information when frontend is not built."""
        return {
            "service": "Posture Monitor Backend",
            "status": "online",
            "docs_url": "/docs",
            "websocket_endpoint": "/ws/posture",
        }
