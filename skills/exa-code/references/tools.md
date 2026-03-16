# exa-code Tools

## web_search_exa

Search the web for any topic and get clean, ready-to-use content.

Best for: Finding current information, news, facts, or answering questions about any topic.
Returns: Clean text content from top search results, ready for LLM use.

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "Websearch query"
    },
    "numResults": {
      "type": "number",
      "description": "Number of search results to return (must be a number, default: 8)"
    },
    "livecrawl": {
      "type": "string",
      "enum": [
        "fallback",
        "preferred"
      ],
      "description": "Live crawl mode - 'fallback': use live crawling as backup if cached content unavailable, 'preferred': prioritize live crawling (default: 'fallback')"
    },
    "type": {
      "type": "string",
      "enum": [
        "auto",
        "fast"
      ],
      "description": "Search type - 'auto': balanced search (default), 'fast': quick results"
    },
    "contextMaxCharacters": {
      "type": "number",
      "description": "Maximum characters for context string optimized for LLMs (must be a number, default: 10000)"
    }
  },
  "required": [
    "query"
  ],
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

## get_code_context_exa

Find code examples, documentation, and programming solutions. Searches GitHub, Stack Overflow, and official docs.

Best for: Any programming question - API usage, library examples, code snippets, debugging help.
Returns: Relevant code and documentation, formatted for easy reading.

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "Search query to find relevant context for APIs, Libraries, and SDKs. For example, 'React useState hook examples', 'Python pandas dataframe filtering', 'Express.js middleware', 'Next js partial prerendering configuration'"
    },
    "tokensNum": {
      "type": "number",
      "minimum": 1000,
      "maximum": 50000,
      "default": 5000,
      "description": "Number of tokens to return (must be a number, 1000-50000). Default is 5000 tokens. Adjust this value based on how much context you need - use lower values for focused queries and higher values for comprehensive documentation."
    }
  },
  "required": [
    "query"
  ],
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```
