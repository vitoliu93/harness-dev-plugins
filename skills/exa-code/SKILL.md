---
name: exa-code
description: Search the web and find code examples, documentation, and programming solutions across GitHub, Stack Overflow, and official docs. Use when the user asks to search for information, find code examples, debug issues, or look up API documentation.
---

# Exa Code Search

This skill provides two powerful search tools: general web search and specialized code/documentation search.

## When to Use

- User asks to search the web for information or news
- User needs code examples, library documentation, or API usage
- User is debugging code or needs programming solutions
- User asks to find Stack Overflow answers or GitHub code

## Tools Available

**web_search_exa**: Search the web for any topic and get clean, ready-to-use content.
- Use for: Finding current information, news, facts, or answering general questions
- Usage: `bun skills/exa-code/scripts/web_search_exa.ts --query "your search query" [--numResults 8] [--livecrawl fallback|preferred] [--type auto|fast] [--contextMaxCharacters 10000]`

**get_code_context_exa**: Find code examples, documentation, and programming solutions.
- Use for: Any programming question - API usage, library examples, code snippets, debugging help
- Usage: `bun skills/exa-code/scripts/get_code_context_exa.ts --query "your search query" [--tokensNum 5000]`

## How to Trigger

When the user asks any of these:
- "Search for..." or "Look up..."
- "Find code examples for..."
- "How do I use [library/API]?"
- "What's the documentation for..."
- "Help me with this error..."
- "Show me examples of..."
