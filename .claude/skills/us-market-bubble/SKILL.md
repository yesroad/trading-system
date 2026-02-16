# US Market Bubble Detection Skill (Revised v2.1)

## Overview

This is Claude Code's official bubble detection framework using data-driven analysis based on the revised Minsky/Kindleberger framework v2.1. The skill prioritizes objective metrics (Put/Call ratios, VIX, margin debt, breadth indicators, IPO data) over subjective impressions.

## When to Use

Activate this skill when users ask about:
- Market bubble risk or valuation concerns
- Profit-taking or entry timing decisions
- Social phenomena suggesting speculative excess
- Risk management for existing positions

## Evaluation Process (Strict Order)

### Phase 1: Mandatory Quantitative Data Collection

Before any analysis begins, collect these measurements:

**Market Structure Data:**
- Put/Call Ratio (CBOE Equity P/C, 5-day moving average)
- VIX current value and 3-month percentile
- 21-day realized volatility

**Leverage & Positioning:**
- FINRA Margin Debt (latest month + YoY % change)
- S&P 500 breadth (% above 50-day moving average)

**IPO Activity:**
- Quarterly IPO count and median first-day returns

⚠️ **Critical:** Do not proceed without Phase 1 data.

### Phase 2: Quantitative Evaluation

Score mechanically using these six indicators (0-12 points total):

| Indicator | Scoring |
|-----------|---------|
| Put/Call Ratio | 2 pts: <0.70; 1 pt: 0.70-0.85; 0 pts: >0.85 |
| VIX Suppression | 2 pts: <12 AND within 5% of highs; 1 pt: 12-15; 0 pts: >15 |
| Margin Debt YoY | 2 pts: +20%+; 1 pt: +10-20%; 0 pts: +10% or less |
| IPO Overheating | 2 pts: >2x average + 20%+ first-day; 1 pt: >1.5x average |
| Breadth Anomaly | 2 pts: New high + <45% above 50DMA; 1 pt: 45-60%; 0 pts: >60% |
| Price Acceleration | 2 pts: 95th percentile; 1 pt: 85-95th; 0 pts: below 85th |

### Phase 3: Qualitative Adjustment (Maximum +3 points)

**Before adding ANY qualitative points, verify:**
- Concrete, measurable data exists
- Independent observers would agree
- No double-counting with Phase 2
- Evidence is documented with sources

**Adjustment A: Social Penetration (+0 to +1)**
- Requires: Direct user reports of non-investor recommendations with names/dates
- Requires: Multiple independent sources (minimum 3)
- Invalid: Vague statements like "everyone talks about stocks"

**Adjustment B: Media/Search Trends (+0 to +1)**
- Requires: Google Trends showing 5x+ year-over-year increase (measured)
- Requires: Mainstream coverage confirmation (specific Time covers, dated TV specials)
- Invalid: "Elevated narrative" without measured data

**Adjustment C: Valuation Disconnect (+0 to +1)**
- Requires: P/E >25 (if not already in Phase 2)
- Requires: Fundamentals explicitly ignored in mainstream discourse
- Requires: "This time is different" documented in major media
- Invalid if: Companies have real earnings supporting valuations

### Phase 4: Final Judgment

```
Final Score = Phase 2 (0-12) + Phase 3 (0 to +3) = 0-15 points

0-4 points:    Normal (100% Risk Budget)
5-7 points:    Caution (70-80% Risk Budget)
8-9 points:    Elevated Risk (50-70% Risk Budget) ← NEW in v2.1
10-12 points:  Euphoria (40-50% Risk Budget)
13-15 points:  Critical (20-30% Risk Budget)
```

## Recommended Actions by Phase

**Normal (0-4):** Continue standard strategy; set 2.0× ATR trailing stops

**Caution (5-7):** Begin partial profit-taking (20-30%); tighten to 1.8× ATR

**Elevated Risk (8-9):** Increase profit-taking (30-50%); selective positions only; build cash reserves

**Euphoria (10-12):** Accelerate stair-step profit-taking (50-60%); no new long positions except pullbacks

**Critical (13-15):** Major profit-taking; full hedge implementation; prepare for dislocation

## Short-Selling Composite Conditions

Only consider after confirming ≥3 of these 7 conditions:
1. Weekly chart shows lower highs
2. Volume peaks out
3. Margin debt drops sharply
4. Media/search trends peak
5. Weak stocks break first
6. VIX spikes above 20
7. Fed/policy shift signals

## Key Changes in v2.1

- Qualitative adjustment maximum reduced to +3 (from +5)
- Added "Elevated Risk" phase (8-9 points) for nuanced positioning
- Confirmation bias prevention checklist required
- ALL qualitative points must have measurable evidence
- Independent verification standard applies to all adjustments

## Data Sources

- **Put/Call & VIX:** cboe.com
- **Margin Debt:** finra.org
- **Breadth:** barchart.com
- **IPO Data:** renaissancecapital.com

## Core Principle

"Bring data." All bubble assessments must be independently verifiable and confirmation-bias free.
