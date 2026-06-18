"""Database connection and bootstrap.

The app connects to an EXTERNAL MariaDB/MySQL server using the credentials
supplied via environment variables, then creates the target database itself
(CREATE DATABASE IF NOT EXISTS) and builds the schema. This is what lets the
container come up against a fresh DB server with nothing pre-created.
"""
import os
import time

from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "3306")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "transition_tracker")

Base = declarative_base()
SessionLocal = sessionmaker(autocommit=False, autoflush=False)
engine = None


def _url(with_db: bool = True) -> str:
    db_part = DB_NAME if with_db else ""
    return (
        f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}"
        f"@{DB_HOST}:{DB_PORT}/{db_part}?charset=utf8mb4"
    )


def bootstrap(retries: int = 15, delay: int = 3) -> None:
    """Create the database (if needed) and all tables. Retries while the
    external DB server is still starting up."""
    global engine
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            # 1) connect to the server without selecting a database
            server_engine = create_engine(_url(with_db=False), pool_pre_ping=True)
            with server_engine.connect() as conn:
                conn.execute(
                    text(
                        f"CREATE DATABASE IF NOT EXISTS `{DB_NAME}` "
                        "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
                    )
                )
                conn.commit()
            server_engine.dispose()

            # 2) connect to the database and create tables
            engine = create_engine(
                _url(with_db=True), pool_pre_ping=True, pool_recycle=280
            )
            SessionLocal.configure(bind=engine)
            from app import models  # noqa: F401  (register models)

            Base.metadata.create_all(bind=engine)
            _run_migrations()
            print(f"[db] connected to {DB_HOST}:{DB_PORT}/{DB_NAME}", flush=True)
            return
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            print(
                f"[db] bootstrap attempt {attempt}/{retries} failed: {exc}",
                flush=True,
            )
            time.sleep(delay)
    raise RuntimeError(f"Database bootstrap failed after {retries} attempts: {last_err}")


def _run_migrations() -> None:
    """Lightweight, idempotent column additions for existing databases.
    create_all() does not ALTER existing tables, so new columns are added here.
    MariaDB/MySQL 8 support ADD COLUMN IF NOT EXISTS."""
    statements = [
        "ALTER TABLE task_definitions "
        "ADD COLUMN IF NOT EXISTS is_golive TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE entities "
        "ADD COLUMN IF NOT EXISTS next_step_due DATE NULL",
        "ALTER TABLE entities ADD COLUMN IF NOT EXISTS contact_name VARCHAR(200) NOT NULL DEFAULT ''",
        "ALTER TABLE entities ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(100) NOT NULL DEFAULT ''",
        "ALTER TABLE entities ADD COLUMN IF NOT EXISTS contact_email VARCHAR(200) NOT NULL DEFAULT ''",
        "ALTER TABLE task_instances ADD COLUMN IF NOT EXISTS next_step VARCHAR(500) NOT NULL DEFAULT ''",
        "ALTER TABLE task_instances ADD COLUMN IF NOT EXISTS next_step_due DATE NULL",
    ]
    with engine.connect() as conn:
        for stmt in statements:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception as exc:  # noqa: BLE001
                print(f"[db] migration skipped ({exc})", flush=True)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
