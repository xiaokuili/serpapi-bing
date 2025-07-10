import os
from langchain import hub
from langchain.agents import AgentExecutor, create_react_agent
from langchain_core.tools import Tool
from langchain_openai import ChatOpenAI
from bing_search_wrapper import BingSearchWrapper

def create_bing_search_tool(search: BingSearchWrapper) -> Tool:
    """Create a Bing search tool."""
    return Tool(
        name="bing_search",
        description="Search the web using Bing. Input should be a search query.",
        func=search.run
    )

async def main():
    # Initialize the search wrapper
    search = BingSearchWrapper()
    
    try:
        # Create the tool
        tools = [create_bing_search_tool(search)]
        
        # Initialize the model
        llm = ChatOpenAI(
            base_url="<your base url>",
            api_key="<your api key>",
            model="<your model>"
        )
        
        # Get the prompt from LangChain hub
        prompt = hub.pull("hwchase17/react")
        
        # Create the agent
        agent = create_react_agent(llm, tools, prompt)
        
        # Create the agent executor
        agent_executor = AgentExecutor(
            agent=agent,
            tools=tools,
            verbose=True
        )
        
        # Example query
        query = "本月发布的新能源汽车有哪些?"
        
        # Run the agent
        response = await agent_executor.ainvoke(
            {"input": query}
        )
        
        print(f"Response: {response}")
        
    finally:
        # Clean up
        await search.aclose()

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())

