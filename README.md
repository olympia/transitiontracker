# Transition Tracker

A web-based project management tool for tracking **recurring tasks across many entities**.
The entities can repeat over anything: racks, sites, countries, buildings. For each
entity you set a **go-live date**, and every task's deadline is calculated automatically
from a per-project **task template** (an offset in days relative to go-live). A matrix
**RAG dashboard** shows, at a glance, what is done, in progress, due soon, or overdue.

This is a web reimplementation of the original `SZHB_LAN_LifeCycle_Migration_Tracker`
Excel workbook.

## Features

- **Multiple projects**, each with its own entities and task template.
- **Configurable task template** (the `PlnDateRecalc` equivalent): name, responsible
  party, and an offset in days. Positive offset = days before go-live, negative = after.
  Tasks can be flagged "no deadline".
- **Entities** with code, name/building, go-live date, location/GPS link, next step,
  on-hold flag, free-form notes, and **inventory tables** (old/new equipment: host, IP,
  model, serial, CMDB ok).
- **RAG matrix dashboard**: rows = entities, columns = tasks, colored cells for status,
  with summary stats, search and filters.
- **Status logic mirrors the spreadsheet**: done (green), overdue (red), due soon within
  a configurable window (amber), scheduled/future (grey), no go-live (blank). Overall
  per-entity roll-up with on-hold handling.
- Light / dark theme.

## Architecture

Single Docker image. A FastAPI backend serves the REST API under `/api` and the built
React single-page app for everything else, on **port 8080**. Data lives in an
**external MariaDB/MySQL** server. On startup the app runs `CREATE DATABASE IF NOT EXISTS`
and creates all tables, so you only need to point it at a DB server and supply
credentials.

```
React (Vite + Tailwind)  ->  built into static assets
                              served by
FastAPI + SQLAlchemy + PyMySQL  ->  external MariaDB
```

## Deploying on Unraid

Unraid runs single containers (no docker-compose), so this ships as one image.

### 1. Publish the image to GHCR

A GitHub Actions workflow (`.github/workflows/docker-publish.yml`) builds and pushes the
image to GitHub Container Registry. Push this repo to GitHub and it runs automatically on
the `main` branch, producing:

```
ghcr.io/<your-username>/transition-tracker:latest
```

By default GHCR packages are private. Make the package **public** (GitHub -> your profile
-> Packages -> transition-tracker -> Package settings -> Change visibility) so Unraid can
pull it without a login. If you keep it private, add your GHCR credentials in Unraid under
the container's registry settings.

**Manual alternative** (no GitHub Actions), from any machine with Docker:

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u <your-username> --password-stdin
docker build -t ghcr.io/<your-username>/transition-tracker:latest .
docker push ghcr.io/<your-username>/transition-tracker:latest
```

`GHCR_TOKEN` is a GitHub personal access token with the `write:packages` scope.

### 2. Add the container in Unraid

Two options:

- **Template file**: edit `unraid-template.xml`, replace `YOUR_GITHUB_USERNAME`, copy it to
  `/boot/config/plugins/dockerMan/templates-user/` on your Unraid box. It then appears under
  Docker -> Add Container -> Template.
- **Manual**: Docker -> Add Container, set Repository to
  `ghcr.io/<your-username>/transition-tracker:latest`, add a port mapping `8080 -> 8080`,
  and add the environment variables below.

### 3. Environment variables

| Variable      | Required | Default              | Description                                        |
|---------------|----------|----------------------|----------------------------------------------------|
| `DB_HOST`     | yes      | —                    | External MariaDB/MySQL host or IP                  |
| `DB_PORT`     | yes      | `3306`               | DB port                                            |
| `DB_USER`     | yes      | —                    | DB user (needs `CREATE DATABASE` on first run)     |
| `DB_PASSWORD` | yes      | —                    | DB password                                        |
| `DB_NAME`     | yes      | `transition_tracker` | Database name, created automatically               |

Open `http://<unraid-ip>:8080` once it is running.

### DB permissions

The user needs permission to create the database on the first run:

```sql
CREATE USER 'tracker'@'%' IDENTIFIED BY 'yourpassword';
GRANT ALL PRIVILEGES ON *.* TO 'tracker'@'%' WITH GRANT OPTION;
FLUSH PRIVILEGES;
```

If you would rather not grant server-wide rights, pre-create the database and grant the
user rights only on it:

```sql
CREATE DATABASE transition_tracker CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON transition_tracker.* TO 'tracker'@'%';
```

## Local testing

With Docker Compose (spins up a throwaway MariaDB):

```bash
docker compose -f docker-compose.dev.yml up --build
# open http://localhost:8080
```

### Running without Docker

Backend:

```bash
cd backend
pip install -r requirements.txt
DB_HOST=localhost DB_USER=root DB_PASSWORD=... uvicorn app.main:app --reload --port 8080
```

Frontend (dev server with API proxy to :8080):

```bash
cd frontend
npm install
npm run dev
```

## How the status logic works

For each task on an entity:

```
planned_date = go-live − offset_days
```

- **done** — actual date set / marked complete
- **overdue** — planned date is before today and not done
- **due soon** — planned date within the project's due-soon window (default 3 days)
- **scheduled** — planned date further in the future
- **blank** — no go-live date, or task marked "no deadline"

Per entity: any overdue task -> Delayed (red); else any due-soon -> In progress (amber);
else On track (green). On-hold entities are shown separately and excluded from roll-ups.

## Project layout

```
backend/         FastAPI app (models, schemas, API, status logic, DB bootstrap)
frontend/        React + Vite + Tailwind SPA
Dockerfile       multi-stage build (frontend build -> python runtime)
unraid-template.xml
docker-compose.dev.yml   local testing only
.github/workflows/docker-publish.yml   GHCR publish
```
