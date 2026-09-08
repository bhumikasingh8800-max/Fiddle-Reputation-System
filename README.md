# First Fiddle Restaurants — AI Reputation Management Platform

## Quick Start (Local Development)

### Prerequisites
- Python 3.11+
- Node.js 20+
- PostgreSQL 15+ (or Docker)

---

### Option 1: Docker Compose (Recommended)

```bash
# Clone and enter project
cd first-fiddle-platform

# Copy env file and fill in your Gemini API key
cp backend/.env.example backend/.env

# Start all services
docker compose up --build
```

Services will be available at:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Docs (Swagger)**: http://localhost:8000/docs

---

### Option 2: Manual Setup

#### Backend

```bash
cd backend

# Create virtual environment
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Install Playwright browsers
playwright install chromium

# Copy and fill environment variables
copy .env.example .env
# Edit .env: set DATABASE_URL, GEMINI_API_KEY

# Start PostgreSQL (must be running)
# Then start the API server
uvicorn app.main:app --reload --port 8000
```

#### Frontend

```bash
cd frontend
npm install
npm run dev
```

---



### Workflow

1. **Add Outlets** → Register your First Fiddle branches with platform URLs
2. **Scrape Reviews** → Click "Scrape Reviews" on any outlet (async job)
3. **Run NLP** → Click "Run NLP" to process sentiment & categories
4. **View Dashboard** → All charts update with live data
5. **Generate AI Insights** → Click "Generate Insights" on the Insights page

---

### Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `GEMINI_API_KEY` | Google Gemini API key (get from Google AI Studio) |
| `GEMINI_MODEL` | Model to use (default: `gemini-3.6-flash`) |
| `SCRAPE_DELAY` | Seconds between scraper requests (default: 2) |
| `SENTIMENT_MODEL` | HuggingFace model name |

---

### Architecture

```
browser → React (Vite) → FastAPI → PostgreSQL
                              ↓
                       Playwright Scrapers
                       (Google, Zomato, TripAdvisor)
                              ↓
                       HuggingFace NLP Pipeline
                       (Sentiment + Categories)
                              ↓
                       Google Gemini API
                       (Operational Recommendations)
```

---

### API Reference

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/restaurants` | List all outlets |
| POST | `/api/restaurants` | Register new outlet |
| POST | `/api/scrape/{id}` | Trigger scraping job |
| GET | `/api/scrape/status/{job_id}` | Poll job status |
| POST | `/api/reviews/process-nlp` | Run NLP pipeline |
| GET | `/api/reviews/{id}` | Get reviews (filterable) |
| GET | `/api/analytics/overview` | Platform-wide stats |
| GET | `/api/analytics/{id}` | Per-outlet stats |
| GET | `/api/analytics/trend/rating` | Weekly rating trend |
| GET | `/api/analytics/comparison/outlets` | All outlets compared |
| POST | `/api/insights/{id}` | Generate AI insights |
| GET | `/api/insights/{id}` | Get cached insights |

