# Value Dividend Screener Skill Documentation

## Overview

The Value Dividend Screener is a comprehensive stock screening tool designed to identify high-quality dividend-paying stocks by combining valuation metrics, income generation potential, and fundamental growth. The skill employs a dual-stage approach using FINVIZ Elite for pre-screening followed by Financial Modeling Prep (FMP) API for detailed analysis.

## Key Capabilities

**Primary Function**: Screen US equities based on quantitative criteria including dividend yield (3%+), valuation ratios (P/E under 20, P/B under 2), and consistent 3-year growth trends in dividends, revenue, and EPS.

**Two-Stage Methodology**:
1. FINVIZ Elite pre-filters candidates (reducing FMP API usage by up to 90%)
2. FMP API conducts detailed fundamental analysis with composite scoring

## When to Invoke

Use this skill when users request:
- Dividend stock screening or income portfolio suggestions
- Value stocks with strong fundamental characteristics
- Quality dividend opportunities with sustainable yields
- Screening combining valuation metrics and dividend analysis

## Workflow Summary

### API Configuration
- Verify FMP_API_KEY and FINVIZ_API_KEY availability
- Provide setup instructions if keys unavailable
- Note: FINVIZ Elite requires subscription (~$330/year)

### Execution Options

**Two-Stage (Recommended)**:
```bash
python3 scripts/screen_dividend_stocks.py --use-finviz
```

**FMP-Only**:
```bash
python3 scripts/screen_dividend_stocks.py
```

### Analysis Output

Scripts generate JSON containing per-stock metrics:
- Valuation: dividend yield, P/E, P/B ratios
- Growth: 3-year CAGR for dividends, revenue, EPS
- Sustainability: payout ratios, FCF coverage assessment
- Quality: ROE, profit margins, composite scoring

### Report Generation

Creates markdown reports with:
- Ranked stock table by composite score
- Detailed analysis for top candidates
- Portfolio construction guidance
- Risk considerations and monitoring recommendations

## Resource Files

**scripts/screen_dividend_stocks.py**: Main screening engine handling API integration, multi-phase filtering, CAGR calculations, and composite scoring

**references/screening_methodology.md**: Detailed documentation of screening phases, threshold justification, and investment philosophy

**references/fmp_api_guide.md**: Complete API setup and usage guide for FMP integration

## Performance Metrics

- Two-stage runtime: 2-3 minutes (30-50 FINVIZ candidates)
- FMP-only runtime: 5-15 minutes (100-300+ candidates)
- API savings: 60-94% reduction in FMP calls with two-stage approach
- Free tier compatible: Two-stage fits within 250 daily FMP calls

## Advanced Customization

Modify screening thresholds in script (lines 383-388) for dividend yield, P/E, P/B, and market cap requirements. Sector filtering, REIT exclusion, and CSV export capabilities available through code modifications.
