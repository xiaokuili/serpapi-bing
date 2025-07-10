# 🔍 SerpAPI-Compatible Bing Scraper

A zero-cost alternative to SerpAPI for Bing search results. This project provides a REST API that returns Bing search results in the exact same format as SerpAPI.

## ✨ Key Features

- **100% SerpAPI Compatible**: Returns identical JSON structure as SerpAPI's Bing search API
- **Zero Cost**: Free alternative to SerpAPI
- **Docker Ready**: Easy deployment with Docker
- **Real-time Scraping**: Fresh results directly from Bing
- **Anti-Bot Protection**: Built-in mechanisms to handle anti-bot measures

## 🚀 Quick Start with Docker

```bash
# Pull and run the container
docker pull your-docker-image
docker run -p 3000:3000 your-docker-image
```

## 🔧 API Usage

```bash
curl "http://localhost:3000/search?q=coffee&page=1"
```

The API returns exactly the same JSON structure as SerpAPI, including:
- search_metadata
- search_parameters
- search_information
- organic_results
- related_searches
- pagination
- serpapi_pagination

## 📞 Contact

- Twitter: @yourtwitterhandle
- WeChat: your_wechat_id

## ⚠️ Disclaimer

This project is not affiliated with or endorsed by SerpAPI or Bing. Use responsibly and in accordance with Bing's terms of service. 