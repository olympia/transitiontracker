"""Application entrypoint.

Serves the REST API under /api and the built React SPA for everything else.
On startup it bootstraps the external database (creates it if missing) and
builds the schema.
"""
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app import database
from app.api import router as api_router

app = FastAPI(title="Transition Tracker", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.on_event("startup")
def on_startup() -> None:
    database.bootstrap()


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


# ---- serve the built frontend (static SPA) ----
STATIC_DIR = os.getenv("STATIC_DIR", "/app/static")

if os.path.isdir(STATIC_DIR):
    assets_dir = os.path.join(STATIC_DIR, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        # let real files through (favicon, etc.); otherwise serve index.html
        candidate = os.path.join(STATIC_DIR, full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))
