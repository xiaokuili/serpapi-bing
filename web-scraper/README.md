# Web Scraper Service

A Node.js service that provides web scraping capabilities using Playwright.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Install Playwright browsers:
```bash
npx playwright install chromium
```

3. Create a `.env` file (optional):
```bash
PORT=5000  # Default port is 3000
```

## Running the Service

Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm start
```

## API Endpoints

### Bing Search Scraper

**Endpoint:** `POST /api/scrape/bing`

```
curl -X POST http://127.0.0.1:5000/api/scrape/bing \
  -H "Content-Type: application/json" \
  -d '{
    "query": "OpenAI ChatGPT",
    "pageLimit": 1
  }'
```

**Request Body:**
```json
{
    "query": "your search query",
    "pageLimit": 1  // Optional, defaults to 1
}
```

**Response:**
```json
{
    "search_parameters": {
        "engine": "bing",
        "q": "your search query",
        "gl": "us",
        "hl": "en"
    },
    "answer_box": {
        "title": "...",
        "snippet": "...",
        "link": "...",
        "type": "featured_snippet"
    },
    "organic_results": [...],
    "related_searches": [...],
    "knowledge_graph": {...},
    "ads": [...],
    "error": null
}
```

### Health Check

**Endpoint:** `GET /health`

**Response:**
```json
{
    "status": "ok"
}
``` 