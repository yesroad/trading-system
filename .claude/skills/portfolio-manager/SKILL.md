# Portfolio Manager Skill

The portfolio-manager skill provides comprehensive investment portfolio analysis by integrating with Alpaca's brokerage API through MCP (Model Context Protocol) to access real-time holdings data.

## Key Capabilities

The skill performs multi-dimensional portfolio assessment including:

- **Asset allocation analysis** across classes, sectors, market caps, and geography
- **Diversification evaluation** measuring concentration risk and position correlation
- **Risk metrics calculation** including beta, volatility, drawdown, and tail risk
- **Performance analysis** showing absolute returns, position-level gains/losses, and benchmark comparisons
- **Individual position assessment** validating investment theses and recommending hold/add/trim/sell actions
- **Rebalancing strategies** prioritizing actions to reduce risk and close allocation gaps

## Workflow Overview

The skill follows a seven-step process:

1. Fetch portfolio data via Alpaca MCP (account info, positions, history)
2. Enrich position data with market fundamentals and technical analysis
3. Perform portfolio-level analysis across multiple dimensions
4. Conduct detailed evaluation of top 10-15 holdings
5. Generate specific rebalancing recommendations with prioritization
6. Create comprehensive markdown report documenting all findings
7. Support interactive follow-up questions on results

## When to Invoke

Use this skill when users request portfolio review, position analysis, risk assessment, performance evaluation, rebalancing suggestions, or related portfolio-management tasks.

## Prerequisites

Alpaca MCP Server must be configured and connected. The skill provides setup instructions if integration is unavailable and supports fallback analysis using manually entered position data.
