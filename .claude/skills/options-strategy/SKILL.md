# Options Strategy Advisor

## Overview

This is a comprehensive options trading analysis tool that provides theoretical pricing, Greeks calculations, and strategy simulation for educational purposes.

## Core Capabilities

- **Black-Scholes theoretical pricing** and Greeks calculations
- **Strategy P/L simulation** across 17+ options strategies
- **Earnings-integrated volatility analysis**
- **Risk management** and position sizing guidance
- **Educational framework** with practical trade simulation

## Key Features

The skill supports major strategies including:
- Covered calls, protective puts
- Bull/bear spreads
- Iron condors
- Straddles/strangles
- Calendar spreads

It features a detailed analysis workflow:
1. Gathering inputs
2. Calculating historical volatility
3. Pricing options
4. Computing Greeks
5. Simulating P/L
6. Generating ASCII diagrams
7. Providing strategy-specific guidance

## Greeks Analysis

The tool calculates:
- **Delta** (directional exposure)
- **Gamma** (delta acceleration)
- **Theta** (daily time decay)
- **Vega** (volatility sensitivity)
- **Rho** (interest rate sensitivity)

## Earnings Integration

Pre-earnings strategies incorporate earnings calendar data to assess:
- Implied moves
- IV crush risk
- Optimal strategy selection between long straddles/strangles versus short iron condors

## Important Limitations

All pricing uses Black-Scholes European-style approximations. **Actual market prices may differ due to bid-ask spread and American vs European pricing.** The tool emphasizes this is theoretical analysis requiring real broker quotes before trading.

## Output Format

Comprehensive markdown reports with:
- Strategy setup
- P/L analysis
- ASCII diagrams
- Greeks interpretation
- Risk assessment
- Trade management guidelines

---

**Dependencies**: Python 3.8+, numpy, scipy, pandas
