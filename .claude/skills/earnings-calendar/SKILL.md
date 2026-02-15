# Earnings Calendar Skill

## Overview

The earnings-calendar skill retrieves upcoming earnings announcements for US stocks using the Financial Modeling Prep (FMP) API. It focuses on mid-cap and larger companies (>$2B market cap) that significantly impact markets.

## Key Features

- **FMP API Integration**: Reliable structured earnings data retrieval
- **Market Cap Filtering**: Focuses on companies >$2B (mid-cap and above)
- **Multi-Environment Support**: CLI, Desktop, and Web compatibility
- **Organized Output**: Markdown reports grouped by date, timing (BMO/AMC/TAS), and market capitalization
- **Flexible API Key Management**: Environment variables, session-based, or manual entry

## Core Workflow

### 1. Date Calculation
Obtain current date and calculate the next 7-day window (YYYY-MM-DD format).

### 2. Load FMP API Guide
Reference `references/fmp_api_guide.md` for endpoints, parameters, authentication, and best practices.

### 3. API Key Configuration
- **CLI/Desktop**: Check environment variable `FMP_API_KEY`
- **Web**: Prompt user for key (session-only storage)
- **Fallback**: Offer manual data entry option

### 4. Retrieve Earnings Data
Execute `scripts/fetch_earnings_fmp.py` with date range and API key:
```
python scripts/fetch_earnings_fmp.py START_DATE END_DATE [API_KEY]
```
Output: JSON with symbol, company name, date, timing, market cap, sector, EPS/revenue estimates.

### 5. Process and Organize
- Parse JSON data
- Verify required fields
- Group by date, then timing, then sort by market cap (descending)
- Calculate summary statistics

### 6. Generate Report
Execute `scripts/generate_report.py` to create formatted markdown:
```
python scripts/generate_report.py earnings_data.json output_filename.md
```

### 7. Quality Assurance
Verify all dates fall within target week, market cap values present, timing specified, proper sorting, and statistics accuracy.

### 8. Deliver Report
Save with naming convention `earnings_calendar_[YYYY-MM-DD].md` and provide summary to user.

## Prerequisites

**FMP API Key (Free)**:
1. Visit https://site.financialmodelingprep.com/developer/docs
2. Create free account
3. Receive API key immediately
4. Free tier: 250 API calls/day

## Timing Reference

- **BMO**: Before Market Open (~6:00-8:00 AM ET)
- **AMC**: After Market Close (~4:00-5:00 PM ET)
- **TAS**: Time Not Announced

## Market Cap Categories

- Mega Cap: >$200B
- Large Cap: $10B-$200B
- Mid Cap: $2B-$10B

## When to Invoke

Use this skill when users request earnings calendar, upcoming earnings announcements, or company reporting schedules.

## Resources

- FMP Documentation: https://site.financialmodelingprep.com/developer/docs
- Skill References: `references/fmp_api_guide.md`, scripts, assets templates
