# Economic Calendar Fetcher

---
name: economic-calendar-fetcher
description: Fetch upcoming economic events and data releases using FMP API. Retrieve scheduled central bank decisions, employment reports, inflation data, GDP releases, and other market-moving economic indicators for specified date ranges (default: next 7 days). Output chronological markdown reports with impact assessment.
---

## Overview

Retrieve upcoming economic events and data releases from the Financial Modeling Prep (FMP) Economic Calendar API. This skill fetches scheduled economic indicators including central bank monetary policy decisions, employment reports, inflation data (CPI/PPI), GDP releases, retail sales, manufacturing data, and other market-moving events that impact financial markets.

The skill uses a Python script to query the FMP API and generates chronological markdown reports with impact assessment for each scheduled event.

**Key Capabilities:**
- Fetch economic events for specified date ranges (max 90 days)
- Support flexible API key provision (environment variable or user input)
- Filter by impact level, country, or event type
- Generate structured markdown reports with impact analysis
- Default to next 7 days for quick market outlook

**Data Source:**
- FMP Economic Calendar API: `https://financialmodelingprep.com/api/v3/economic_calendar`
- Covers major economies: US, EU, UK, Japan, China, Canada, Australia
- Event types: Central bank decisions, employment, inflation, GDP, trade, housing, surveys

## When to Use This Skill

Use this skill when the user requests:

1. **Economic Calendar Queries:**
   - "What economic events are coming up this week?"
   - "Show me the economic calendar for the next two weeks"
   - "When is the next FOMC meeting?"
   - "What major economic data is being released next month?"

2. **Market Event Planning:**
   - "What should I watch for in the markets this week?"
   - "Are there any high-impact economic releases coming?"
   - "When is the next jobs report / CPI release / GDP report?"

3. **Specific Date Range Requests:**
   - "Get economic events from January 1 to January 31"
   - "What's on the economic calendar for Q1 2025?"

4. **Country-Specific Queries:**
   - "Show me US economic data releases next week"
   - "What ECB events are scheduled?"
   - "When is Japan releasing their inflation data?"

**DO NOT use this skill for:**
- Past economic events (use market-news-analyst for historical analysis)
- Corporate earnings calendars (this skill excludes earnings)
- Real-time market data or live quotes
- Technical analysis or chart interpretation

## Workflow Summary

1. **Obtain FMP API Key** - Check environment variable or prompt user
2. **Determine Date Range** - Default 7 days or user-specified range
3. **Execute API Fetch Script** - Run get_economic_calendar.py
4. **Parse and Filter Events** - Apply user filters (impact, country, type)
5. **Assess Market Impact** - Evaluate significance of each event
6. **Generate Output Report** - Create structured markdown report

## Resources

**Python Script:**
- `scripts/get_economic_calendar.py`: Main API fetch script with CLI interface

**Reference Documentation:**
- `references/fmp_api_documentation.md`: Complete FMP Economic Calendar API reference

**API Details:**
- Endpoint: `https://financialmodelingprep.com/api/v3/economic_calendar`
- Authentication: API key required (free tier: 250 requests/day)
- Max date range: 90 days per request
- Response format: JSON array of event objects
