import asyncio
import logging
import os
from typing import Any, Optional

import aiohttp
from pydantic import BaseModel, ConfigDict, Field

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

class BingSearchWrapper(BaseModel):
    """
    Wrapper around the web scraper service for Bing Search,
    supporting both synchronous and asynchronous calls for LangChain compatibility.
    """

    params: dict = Field(
        default={
            "engine": "bing",
            "gl": "us",  # Geo-location, can be modified
            "hl": "en",  # Host language, can be modified
            "page_limit": 1  # Default page limit for scraping
        }
    )
    aiosession: Optional[aiohttp.ClientSession] = None
    scraper_service_url: str = Field(
        default=os.getenv("SCRAPER_SERVICE_URL", "http://localhost:3001"),
        description="URL of the web scraper service"
    )

    model_config = ConfigDict(
        arbitrary_types_allowed=True,
        extra="forbid",
    )

    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create an aiohttp session."""
        if self.aiosession is None:
            self.aiosession = aiohttp.ClientSession()
        return self.aiosession

    async def aclose(self):
        """Close the aiohttp session if it exists."""
        if self.aiosession:
            await self.aiosession.close()
            self.aiosession = None

    async def arun(self, query: str, **kwargs: Any) -> str:
        """Run query through Bing Scraper and parse result async."""
        raw_results = await self.aresults(query, **kwargs)
        return self._process_response(raw_results)

    def run(self, query: str, **kwargs: Any) -> str:
        """Run query through Bing Scraper and parse result (synchronous wrapper for async)."""
        try:
            loop = asyncio.get_running_loop()
            if loop.is_running():
                return asyncio.run_coroutine_threadsafe(
                    self.arun(query, **kwargs), loop
                ).result()
        except RuntimeError:
            return asyncio.run(self.arun(query, **kwargs))

    def results(self, query: str, **kwargs: Any) -> dict:
        """Run query through Bing Scraper and return the raw result (synchronous wrapper for async)."""
        try:
            loop = asyncio.get_running_loop()
            if loop.is_running():
                return asyncio.run_coroutine_threadsafe(
                    self.aresults(query, **kwargs), loop
                ).result()
        except RuntimeError:
            return asyncio.run(self.aresults(query, **kwargs))

    async def aresults(self, query: str, **kwargs: Any) -> dict:
        """Asynchronously run query through Bing Scraper and return the raw result."""
        logging.info(f"Initiating search for query: {query}")
        
        session = await self._get_session()
        effective_params = {**self.params, **kwargs, "q": query}
        page_limit = effective_params.get("page_limit", 1)

        try:
            async with session.post(
                f"{self.scraper_service_url}/api/scrape/bing",
                json={"query": query, "pageLimit": page_limit}
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    return {
                        "error": f"Service error: {error_text}",
                        "search_parameters": {"q": query}
                    }
                return await response.json()
        except Exception as e:
            logging.error(f"Error during scraping: {e}")
            return {
                "error": f"Request error: {str(e)}",
                "search_parameters": {"q": query}
            }

    @staticmethod
    def _process_response(res: dict) -> str:
        """Process the raw Bing search response into a summarized string."""
        if res.get("error"):
            return f"Error from Bing Scraper: {res['error']}"

        snippets = []

        if "answer_box" in res.keys() and res["answer_box"]:
            answer_box = res["answer_box"]
            if answer_box.get("snippet"):
                snippets.append(f"Answer: {answer_box['snippet']}")
            elif answer_box.get("title") and answer_box.get("link"):
                snippets.append(f"Answer Title: {answer_box['title']}, Link: {answer_box['link']}")

        if "knowledge_graph" in res.keys() and res["knowledge_graph"]:
            knowledge_graph = res["knowledge_graph"]
            title = knowledge_graph.get("title", "")
            description = knowledge_graph.get("description", "")
            if description:
                snippets.append(f"Knowledge Graph: {title} - {description}")
            for key, value in knowledge_graph.items():
                if isinstance(key, str) and isinstance(value, str) and \
                   key not in ["title", "description", "image"] and \
                   not value.startswith("http"):
                    snippets.append(f"{title} {key}: {value}.")

        for organic_result in res.get("organic_results", []):
            if "snippet" in organic_result.keys():
                snippets.append(organic_result["snippet"])
            elif "title" in organic_result.keys() and "link" in organic_result.keys():
                snippets.append(f"Title: {organic_result['title']}, Link: {organic_result['link']}")

        if "related_searches" in res.keys() and res["related_searches"]:
            related_queries = [s["query"] for s in res["related_searches"] if "query" in s]
            if related_queries:
                snippets.append("Related Searches: " + ", ".join(related_queries))
        
        if "ads" in res.keys() and res["ads"]:
            for ad in res["ads"][:2]:
                ad_info = f"Ad: {ad.get('title', 'N/A')}"
                if ad.get('snippet'):
                    ad_info += f" - {ad['snippet']}"
                snippets.append(ad_info)

        if len(snippets) > 0:
            return "\n".join(snippets)
        else:
            return "No good search result found." 