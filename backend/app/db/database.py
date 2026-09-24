import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Resilient SQLite location prioritizing /app/data in containers
data_dir = Path("/app/data") if Path("/app/data").exists() else Path(__file__).resolve().parent.parent.parent
data_dir.mkdir(parents=True, exist_ok=True)
DEFAULT_DB_URL = f"sqlite:///{data_dir / 'ergosense.db'}"

DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_DB_URL)

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """FastAPI dependency yielding database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
