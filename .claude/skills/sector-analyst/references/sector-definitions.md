# GICS 섹터 정의 및 대표 ETF

## 1. 11개 GICS 섹터

### 1.1 Technology (XLK)
**정의:** 소프트웨어, 하드웨어, 반도체, IT 서비스
**대표 종목:** Apple, Microsoft, NVIDIA, AMD
**ETF:** XLK (Technology Select Sector SPDR Fund)
**특징:** 성장주, 경기 민감, 고변동성

### 1.2 Financials (XLF)
**정의:** 은행, 보험, 증권, 자산관리
**대표 종목:** JPMorgan, Bank of America, Berkshire Hathaway
**ETF:** XLF (Financial Select Sector SPDR Fund)
**특징:** 금리 민감, 경기 회복기 강세

### 1.3 Healthcare (XLV)
**정의:** 제약, 바이오텍, 의료기기, 헬스케어 서비스
**대표 종목:** UnitedHealth, Johnson & Johnson, Pfizer
**ETF:** XLV (Health Care Select Sector SPDR Fund)
**특징:** 방어주, 인구 고령화 수혜

### 1.4 Consumer Discretionary (XLY)
**정의:** 자동차, 소매, 호텔, 레저
**대표 종목:** Amazon, Tesla, McDonald's, Nike
**ETF:** XLY (Consumer Discretionary Select Sector SPDR Fund)
**특징:** 경기 민감, 소비 증가 시 강세

### 1.5 Consumer Staples (XLP)
**정의:** 식품, 음료, 생활용품, 슈퍼마켓
**대표 종목:** Procter & Gamble, Coca-Cola, Walmart
**ETF:** XLP (Consumer Staples Select Sector SPDR Fund)
**특징:** 방어주, 안정적 수익

### 1.6 Energy (XLE)
**정의:** 석유, 천연가스, 에너지 장비
**대표 종목:** ExxonMobil, Chevron, ConocoPhillips
**ETF:** XLE (Energy Select Sector SPDR Fund)
**특징:** 원유 가격 연동, 인플레이션 헤지

### 1.7 Industrials (XLI)
**정의:** 항공우주, 건설, 기계, 운송
**대표 종목:** Boeing, Caterpillar, GE, UPS
**ETF:** XLI (Industrial Select Sector SPDR Fund)
**특징:** 경기 회복기 강세, 인프라 수혜

### 1.8 Materials (XLB)
**정의:** 화학, 금속, 광산, 종이
**대표 종목:** Linde, DuPont, Freeport-McMoRan
**ETF:** XLB (Materials Select Sector SPDR Fund)
**특징:** 원자재 가격 연동, 인플레이션 수혜

### 1.9 Utilities (XLU)
**정의:** 전기, 가스, 수도
**대표 종목:** NextEra Energy, Duke Energy, Southern Company
**ETF:** XLU (Utilities Select Sector SPDR Fund)
**특징:** 방어주, 배당주, 금리 민감 (역)

### 1.10 Real Estate (XLRE)
**정의:** REIT, 부동산 개발, 부동산 서비스
**대표 종목:** American Tower, Prologis, Crown Castle
**ETF:** XLRE (Real Estate Select Sector SPDR Fund)
**특징:** 금리 민감 (역), 인플레이션 헤지

### 1.11 Communication Services (XLC)
**정의:** 통신, 미디어, 엔터테인먼트
**대표 종목:** Meta, Alphabet, Disney, Netflix
**ETF:** XLC (Communication Services Select Sector SPDR Fund)
**특징:** 성장주 + 방어주 혼합

## 2. 섹터별 특성 비교

```typescript
interface SectorCharacteristics {
  sector: string;
  etf: string;
  beta: number;              // 시장 대비 변동성
  dividend_yield: number;    // 평균 배당 수익률
  pe_ratio: number;          // 평균 PER
  cyclicality: 'HIGH' | 'MEDIUM' | 'LOW';
  growth_vs_value: 'GROWTH' | 'VALUE' | 'BLEND';
}

const SECTOR_CHARACTERISTICS: SectorCharacteristics[] = [
  { sector: 'Technology', etf: 'XLK', beta: 1.2, dividend_yield: 0.8, pe_ratio: 28, cyclicality: 'HIGH', growth_vs_value: 'GROWTH' },
  { sector: 'Financials', etf: 'XLF', beta: 1.1, dividend_yield: 2.5, pe_ratio: 12, cyclicality: 'HIGH', growth_vs_value: 'VALUE' },
  { sector: 'Healthcare', etf: 'XLV', beta: 0.8, dividend_yield: 1.6, pe_ratio: 18, cyclicality: 'LOW', growth_vs_value: 'BLEND' },
  { sector: 'Consumer Discretionary', etf: 'XLY', beta: 1.15, dividend_yield: 1.2, pe_ratio: 22, cyclicality: 'HIGH', growth_vs_value: 'GROWTH' },
  { sector: 'Consumer Staples', etf: 'XLP', beta: 0.6, dividend_yield: 2.8, pe_ratio: 20, cyclicality: 'LOW', growth_vs_value: 'VALUE' },
  { sector: 'Energy', etf: 'XLE', beta: 1.3, dividend_yield: 3.5, pe_ratio: 10, cyclicality: 'HIGH', growth_vs_value: 'VALUE' },
  { sector: 'Industrials', etf: 'XLI', beta: 1.0, dividend_yield: 1.9, pe_ratio: 19, cyclicality: 'HIGH', growth_vs_value: 'BLEND' },
  { sector: 'Materials', etf: 'XLB', beta: 1.1, dividend_yield: 2.2, pe_ratio: 16, cyclicality: 'HIGH', growth_vs_value: 'VALUE' },
  { sector: 'Utilities', etf: 'XLU', beta: 0.5, dividend_yield: 3.2, pe_ratio: 17, cyclicality: 'LOW', growth_vs_value: 'VALUE' },
  { sector: 'Real Estate', etf: 'XLRE', beta: 0.9, dividend_yield: 3.0, pe_ratio: 40, cyclicality: 'MEDIUM', growth_vs_value: 'VALUE' },
  { sector: 'Communication Services', etf: 'XLC', beta: 1.0, dividend_yield: 0.9, pe_ratio: 21, cyclicality: 'MEDIUM', growth_vs_value: 'GROWTH' },
];
```

## 3. 실전 활용

```typescript
async function fetchSectorETFData(etf: string): Promise<{
  price: number;
  change_1d: number;
  change_5d: number;
  change_1m: number;
  volume_ratio: number;
}> {
  // Yahoo Finance API 등으로 데이터 수집
  const data = await yahooFinance.quote(etf);
  return {
    price: data.regularMarketPrice,
    change_1d: data.regularMarketChangePercent,
    change_5d: ((data.regularMarketPrice - data.fiftyDayAverage) / data.fiftyDayAverage) * 100,
    change_1m: ((data.regularMarketPrice - data.twoHundredDayAverage) / data.twoHundredDayAverage) * 100,
    volume_ratio: data.regularMarketVolume / data.averageDailyVolume10Day,
  };
}
```

---

**마지막 업데이트:** 2026-02-15
**버전:** 1.0
