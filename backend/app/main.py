"""FastAPI application entrypoint for the posture monitor system."""
from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.endpoints import router as api_router
from .api.websocket import router as ws_router
from .core.state import get_tracker

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("posture_monitor")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handles startup initialization and graceful shutdown."""
    logger.info("Initializing Posture Monitor Backend service...")
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

# CORS Configuration for local frontend development
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
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


@app.get("/")
def root():
    """Service status information."""
    return {
        "service": "Posture Monitor Backend",
        "status": "online",
        "docs_url": "/docs",
        "websocket_endpoint": "/ws/posture",
    }
