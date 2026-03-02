# RankReady Web UI — Design Document

**Date:** 2026-03-02
**Status:** Approved

---

## Overview

A minimal, modern web dashboard for the RankReady SEO audit tool. Provides a browser-based interface for running audits, viewing results with real-time progress, downloading PDF reports, and browsing audit history. Deployed as a Docker Compose service on the NUC, accessible via Tailscale at `https://nexus.roborovski-galaxy.ts.net/rankready`.

---

## Architecture

**Framework:** FastAPI (async, matches existing RankReady async codebase)
**Frontend:** Single HTML page with embedded CSS/JS. Server-rendered with JavaScript for SSE and dynamic updates.
**Storage:** SQLite for audit history
**Port:** 8100
**Tailscale path:** `/rankready`

---

## Page Layout

Single page with a header and two main sections:

### Header
- "RankReady" branding/logo (left)
- "← Back to Dashboard" link → `https://nexus.roborovski-galaxy.ts.net/` (right)

### Section 1: Audit Form (always visible at top)
- URL input (required, prominent)
- "Add Competitor" button (expandable, up to 2 competitor URL fields)
- Premium toggle checkbox (reveals extra options: crawl pages slider, AI roadmap toggle)
- **"Run Audit" button** — large, primary action
- While running: button disabled, progress indicators stream below

### Section 2: Tabbed Content Area
**Tab 1: Results** (active during/after audit)
- Real-time progress: module-by-module status updates via SSE
- On completion:
  - **Report Card** — 6 SVG gauges in a grid (same gauge style as PDF)
  - **Quick Wins** — top 5 actionable fixes
  - **Module Details** — expandable/collapsible sections per module with findings tables
  - **PDF Download Button** — prominent, downloads the generated PDF
  - If competitors: side-by-side grade comparison

**Tab 2: History** (past audits)
- Table: Date, URL, Module Grades (compact), Status, Actions
- Actions per row: "View Results" (loads results in Tab 1), "Download PDF"
- Sorted by date descending
- Paginated or infinite scroll if many audits

---

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/` | GET | Main page (form + history) |
| `/audit` | POST | Start new audit, returns JSON `{id, status}` |
| `/audit/{id}/stream` | GET | SSE endpoint — streams progress events |
| `/audit/{id}` | GET | JSON: completed audit results |
| `/audit/{id}/pdf` | GET | Download PDF file |
| `/audit/{id}/results` | GET | HTML fragment: rendered results for loading into Tab 1 |
| `/audits` | GET | JSON: list of past audits for history table |
| `/health` | GET | Health check → `{"status": "ok"}` |

### SSE Event Types
```
event: module_start
data: {"module": "on_page_seo", "index": 1, "total": 6}

event: module_complete
data: {"module": "on_page_seo", "grade": "A", "score": 94.0}

event: audit_complete
data: {"id": "abc123", "pdf_ready": true}

event: error
data: {"message": "Failed to fetch URL"}
```

---

## Storage

**SQLite** database at a Docker volume-mounted path (`/app/data/rankready.db`).

### Schema

```sql
CREATE TABLE audits (
    id TEXT PRIMARY KEY,           -- UUID
    url TEXT NOT NULL,
    competitors TEXT,              -- JSON array of competitor URLs
    status TEXT DEFAULT 'pending', -- pending, running, complete, failed
    premium BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    report_json TEXT,              -- Full AuditReport as JSON
    pdf_path TEXT,                 -- Path to generated PDF file
    error_message TEXT
);
```

---

## UI Design Direction

- **Modern, dark theme** — dark background (#0f172a), card-based layout with subtle borders
- **Clean typography** — system sans-serif, clear hierarchy
- **SVG gauges** — same stroke-dasharray technique proven in Phase 0 (reuse from generator.py)
- **Color-coded grades** — green (A/B), yellow (C), red (D/F) — consistent with PDF
- **Responsive** — works on desktop and tablet (not targeting mobile)
- **Animations** — subtle transitions on tab switches, progress updates, gauge fill animations
- **Will be polished with impeccable:frontend-design skill during implementation**

---

## Docker Deployment

### Dockerfile
```dockerfile
FROM python:3.13-slim

# WeasyPrint system deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 libpangoft2-1.0-0 libpangocairo-1.0-0 \
    libgdk-pixbuf2.0-0 libffi-dev libcairo2 \
    && rm -rf /var/lib/apt/lists/*

# Playwright deps
RUN pip install playwright && playwright install chromium && playwright install-deps chromium

WORKDIR /app
COPY pyproject.toml .
RUN pip install -e ".[dev]"

COPY . .

EXPOSE 8100
CMD ["uvicorn", "rankready.web:app", "--host", "0.0.0.0", "--port", "8100"]
```

### compose.yaml
```yaml
services:
  web:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: rankready
    restart: unless-stopped
    ports:
      - "${WEB_PORT:-8100}:8100"
    environment:
      TZ: America/New_York
      PORT: 8100
    volumes:
      - rankready_data:/app/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8100/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
    labels:
      - "com.dockge.name=RankReady"
      - "com.dockge.description=SEO audit tool with PDF reports"

volumes:
  rankready_data:
    driver: local
```

---

## Bonsai Dashboard Integration

### config.yaml entry
```yaml
- id: rankready
  name: "RankReady"
  description: "SEO audit tool that generates branded PDF reports"
  type: "docker-compose"
  tech: ["Python", "FastAPI", "Playwright", "WeasyPrint"]
  url: "https://nexus.roborovski-galaxy.ts.net/rankready"
  port: 8100
  health_endpoint: "/health"
  source_path: "rankready"
```

### Tailscale serve
```bash
sudo tailscale serve --bg https://nexus.roborovski-galaxy.ts.net/rankready http://localhost:8100
```

### Dashboard icon
Add SEO/chart icon SVG to dashboard.html for the `rankready` app ID.

---

## File Structure (new/modified)

```
rankready/
├── rankready/
│   └── web.py                  # FastAPI app (new)
├── templates/
│   └── index.html              # Single-page UI (new)
├── static/                     # Static assets if needed (new)
├── Dockerfile                  # Container build (new)
├── compose.yaml                # Docker Compose (new)
└── data/                       # SQLite + PDFs (Docker volume)
```

---

## Implementation Notes

- `web.py` imports and reuses all existing RankReady modules — no duplication
- Audit runs in a background asyncio task; SSE streams progress to the browser
- PDF generation reuses existing `generate_pdf()` from `rankready/report/generator.py`
- SVG gauge rendering reuses `gauge_svg()` from generator.py (exposed as a Jinja2 helper)
- SQLite accessed via `aiosqlite` for async compatibility
- Use `impeccable:frontend-design` skill for UI polish during implementation
