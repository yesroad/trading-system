# Institutional Flow Tracker

---
name: institutional-flow-tracker
description: Use this skill to track institutional investor ownership changes and portfolio flows using 13F filings data. Analyzes hedge funds, mutual funds, and other institutional holders to identify stocks with significant smart money accumulation or distribution. Helps discover stocks before major moves by following where sophisticated investors are deploying capital.
---

## Overview

This skill tracks institutional investor activity through 13F SEC filings to identify "smart money" flows into and out of stocks. By analyzing quarterly changes in institutional ownership, you can discover stocks that sophisticated investors are accumulating before major price moves, or identify potential risks when institutions are reducing positions.

**Key Insight:** Institutional investors (hedge funds, pension funds, mutual funds) manage trillions of dollars and conduct extensive research. Their collective buying/selling patterns often precede significant price movements by 1-3 quarters.

## When to Use This Skill

Use this skill when:
- Validating investment ideas (checking if smart money agrees with your thesis)
- Discovering new opportunities (finding stocks institutions are accumulating)
- Risk assessment (identifying stocks institutions are exiting)
- Portfolio monitoring (tracking institutional support for your holdings)
- Following specific investors (tracking Warren Buffett, Cathie Wood, etc.)
- Sector rotation analysis (identifying where institutions are rotating capital)

**Do NOT use when:**
- Seeking real-time intraday signals (13F data has 45-day reporting lag)
- Analyzing micro-cap stocks (<$100M market cap with limited institutional interest)
- Looking for short-term trading signals (<3 months horizon)

## Data Sources & Requirements

### Required: FMP API Key

This skill uses Financial Modeling Prep (FMP) API to access 13F filing data:

**Setup:**
```bash
# Set environment variable (preferred)
export FMP_API_KEY=your_key_here

# Or provide when running scripts
python3 scripts/track_institutional_flow.py --api-key YOUR_KEY
```

**13F Filing Schedule:**
- Filed quarterly within 45 days after quarter end
- Q1 (Jan-Mar): Filed by mid-May
- Q2 (Apr-Jun): Filed by mid-August
- Q3 (Jul-Sep): Filed by mid-November
- Q4 (Oct-Dec): Filed by mid-February

## Analysis Workflow

### Step 1: Identify Stocks with Significant Institutional Changes

Execute the main screening script to find stocks with notable institutional activity.

### Step 2: Deep Dive on Specific Stocks

For detailed analysis of a specific stock's institutional ownership.

### Step 3: Track Specific Institutional Investors

Follow the portfolio moves of specific hedge funds or investment firms.

### Step 4: Interpretation and Action

Read the references for interpretation guidance:
- `references/13f_filings_guide.md` - Understanding 13F data and limitations
- `references/institutional_investor_types.md` - Different investor types and their strategies
- `references/interpretation_framework.md` - How to interpret institutional flow signals

## Signal Strength Framework

**Strong Bullish (Consider buying):**
- Institutional ownership increasing >15% QoQ
- Number of institutions increasing >10%
- Quality long-term investors adding positions
- Low current ownership (<40%) with room to grow
- Accumulation happening across multiple quarters

**Strong Bearish (Consider selling/avoiding):**
- Institutional ownership decreasing >15% QoQ
- Number of institutions decreasing >10%
- Quality investors exiting positions
- Distribution happening across multiple quarters
- Concentration risk (top holder selling large position)

## Limitations and Caveats

**Data Lag:**
- 13F filings have 45-day reporting delay
- Positions may have changed since filing date
- Use as confirming indicator, not leading signal

**Coverage:**
- Only institutions managing >$100M are required to file
- Excludes individual investors and smaller funds
- International institutions may not file 13F

**Reporting Rules:**
- Only long equity positions reported (no shorts, options, bonds)
- Holdings as of quarter-end snapshot
- Some positions may be confidential (delayed reporting)

## Resources

The `references/` folder contains detailed guides:

- **13f_filings_guide.md** - Comprehensive guide to 13F SEC filings
- **institutional_investor_types.md** - Different types of institutional investors
- **interpretation_framework.md** - Framework for interpreting institutional ownership changes
