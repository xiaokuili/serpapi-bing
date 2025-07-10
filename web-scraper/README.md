# 🔍 SerpAPI-Compatible Bing Scraper

[![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)
[![Node.js](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/express.js-%23404d59.svg?style=for-the-badge&logo=express&logoColor=%2361DAFB)](https://expressjs.com/)
[![Playwright](https://img.shields.io/badge/playwright-2EAD33.svg?style=for-the-badge&logo=playwright&logoColor=white)](https://playwright.dev/)

A zero-cost alternative to SerpAPI for Bing search results. This project provides a REST API that returns Bing search results in the same format as SerpAPI, making it a drop-in replacement for applications using SerpAPI's Bing endpoint.

## ✨ Features

- 🆓 Zero-cost alternative to SerpAPI
- 🔄 SerpAPI-compatible response format
- 🚀 Fast and efficient scraping
- 🛡️ Built-in anti-bot detection
- 🐳 Docker support for easy deployment
- 🔄 Automatic retries on failures

## 🚀 Quick Start with Docker

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/serpapi-bing.git
   cd serpapi-bing/web-scraper
   ```

2. Build the Docker image:
   ```bash
   docker build -t serpapi-bing .
   ```

3. Run the container:
   ```bash
   docker run -d -p 3001:3001 serpapi-bing
   ```

The API will be available at http://localhost:3001

## 🛠️ API Usage

Make a GET request to the search endpoint:

```bash
curl "http://localhost:3001/search?q=your+search+query&page_limit=1"
```

### Parameters

- `q` (required): Search query
- `page_limit` (optional): Number of pages to scrape (default: 1)

### Response Format

```json
{
  "search_parameters": {
    "engine": "bing",
    "q": "your search query",
    "gl": "us",
    "hl": "en"
  },
  "organic_results": [
    {
      "position": 1,
      "title": "Result title",
      "link": "https://example.com",
      "snippet": "Result description..."
    }
    // ... more results
  ],
  "related_searches": [],
  "answer_box": {},
  "knowledge_graph": {},
  "ads": []
}
```

## 🔧 Development Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

## 📝 Environment Variables

Create a `.env` file in the project root:

```env
PORT=3001
```

## 📞 Contact

- Twitter: [@yourtwitterhandle](https://twitter.com/yourtwitterhandle)
- WeChat: your_wechat_id

## ⚠️ Disclaimer

This project is for educational purposes only. Please ensure you comply with Bing's terms of service and robots.txt when using this scraper.

## 📄 License

MIT License - feel free to use this project for any purpose, including commercial applications. 