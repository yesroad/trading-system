# Technical Indicators (기술적 지표)

가격과 거래량 데이터를 기반으로 한 수학적 계산 지표

## 추세 지표 (Trend Indicators)

### 1. Moving Averages (이동평균선)

#### Simple Moving Average (SMA)
```
SMA = (P1 + P2 + ... + Pn) / n
```

**주요 기간:**
- 20일: 단기
- 50일: 중기
- 200일: 장기

**신호:**
- 가격 > MA: 상승 추세
- 가격 < MA: 하락 추세
- Golden Cross: 50 MA > 200 MA (매수)
- Death Cross: 50 MA < 200 MA (매도)

#### Exponential Moving Average (EMA)
```
EMA = (Price - EMA_prev) × Multiplier + EMA_prev
Multiplier = 2 / (n + 1)
```

**특징:**
- 최근 가격에 더 큰 가중치
- SMA보다 반응 빠름
- 단기 트레이딩 선호

### 2. MACD (Moving Average Convergence Divergence)

```
MACD Line = 12 EMA - 26 EMA
Signal Line = 9 EMA of MACD Line
Histogram = MACD Line - Signal Line
```

**신호:**
- MACD > Signal: 매수
- MACD < Signal: 매도
- 히스토그램 > 0: 상승 모멘텀
- 히스토그램 < 0: 하락 모멘텀

**다이버전스:**
- Bullish: 가격 ↓, MACD ↑ (반전 임박)
- Bearish: 가격 ↑, MACD ↓ (반전 임박)

### 3. ADX (Average Directional Index)

```
ADX = 14일 평균 DX
```

**범위:** 0-100
- **ADX < 20**: 약한 추세 (레인징)
- **ADX 20-40**: 추세 형성 중
- **ADX > 40**: 강한 추세
- **ADX > 60**: 매우 강한 추세

**+DI / -DI:**
- +DI > -DI: 상승 추세
- -DI > +DI: 하락 추세

## 모멘텀 지표 (Momentum Indicators)

### 1. RSI (Relative Strength Index)

```
RSI = 100 - (100 / (1 + RS))
RS = 평균 상승폭 / 평균 하락폭 (14일)
```

**범위:** 0-100

**레벨:**
- **RSI > 70**: 과매수 (매도 고려)
- **RSI < 30**: 과매도 (매수 고려)
- **RSI 50**: 중립

**다이버전스:**
- Bullish: 가격 신저가, RSI는 더 높은 저점
- Bearish: 가격 신고가, RSI는 더 낮은 고점

**추세 내 해석:**
- 강세장: RSI 40-90 (30 아래로 잘 안 감)
- 약세장: RSI 10-60 (70 위로 잘 안 감)

### 2. Stochastic Oscillator

```
%K = (Current - Lowest Low) / (Highest High - Lowest Low) × 100
%D = 3일 SMA of %K
```

**범위:** 0-100

**신호:**
- %K > 80: 과매수
- %K < 20: 과매도
- %K > %D: 매수
- %K < %D: 매도

**Slow vs Fast:**
- Fast: %K (14, 1, 3) - 민감
- Slow: %K (14, 3, 3) - 부드러움

### 3. CCI (Commodity Channel Index)

```
CCI = (Typical Price - SMA) / (0.015 × Mean Deviation)
Typical Price = (High + Low + Close) / 3
```

**범위:** -∞ ~ +∞ (보통 -300 ~ +300)

**레벨:**
- CCI > +100: 과매수
- CCI < -100: 과매도

## 변동성 지표 (Volatility Indicators)

### 1. Bollinger Bands

```
Middle Band = 20 SMA
Upper Band = Middle + (2 × Std Dev)
Lower Band = Middle - (2 × Std Dev)
```

**신호:**
- 가격이 Upper Band 터치: 과매수
- 가격이 Lower Band 터치: 과매도
- Squeeze (밴드 좁아짐): 큰 움직임 임박
- Expansion (밴드 넓어짐): 변동성 증가

**전략:**
- Bollinger Bounce: 밴드에서 반등
- Bollinger Squeeze: 브레이크아웃 대기

### 2. ATR (Average True Range)

```
TR = max(High - Low, abs(High - PrevClose), abs(Low - PrevClose))
ATR = 14일 평균 TR
```

**용도:**
- 변동성 측정 (절대값)
- 손절매 설정: Entry ± (ATR × 2)
- 포지션 사이징

**해석:**
- ATR 증가: 변동성 확대
- ATR 감소: 변동성 축소

### 3. Standard Deviation

```
σ = √[(Σ(x - μ)²) / n]
```

**용도:**
- Bollinger Bands 계산
- 리스크 측정
- 옵션 가격 책정

## 거래량 지표 (Volume Indicators)

### 1. OBV (On-Balance Volume)

```
OBV = OBV_prev + Volume (가격 상승 시)
OBV = OBV_prev - Volume (가격 하락 시)
```

**신호:**
- OBV 상승 + 가격 상승: 건강한 상승
- OBV 하락 + 가격 하락: 건강한 하락

**다이버전스:**
- 가격 신고가, OBV 정체: 약세 다이버전스
- 가격 신저가, OBV 상승: 강세 다이버전스

### 2. Volume Profile

**가격대별 거래량 분포**

- **POC (Point of Control)**: 거래량 최다 가격
- **HVN (High Volume Node)**: 거래 많은 구간 (지지/저항)
- **LVN (Low Volume Node)**: 거래 적은 구간 (빠른 이동)

### 3. A/D Line (Accumulation/Distribution)

```
AD = ((Close - Low) - (High - Close)) / (High - Low) × Volume
```

**신호:**
- AD 상승: 축적 (매수 압력)
- AD 하락: 분산 (매도 압력)

## 지표 조합 전략

### 1. 추세 추종 시스템
- ADX > 25 (추세 확인)
- +DI > -DI (방향 확인)
- MACD > Signal (진입)

### 2. 역추세 (평균 회귀)
- Bollinger Band 이탈
- RSI 극단값 (>70 or <30)
- Stochastic 과매수/과매도

### 3. 브레이크아웃
- Bollinger Squeeze
- ATR 확장
- 거래량 급증

### 4. 다이버전스 트레이딩
- 가격 vs RSI 다이버전스
- 가격 vs MACD 다이버전스
- 가격 vs OBV 다이버전스

## 지표 사용 원칙

### DO
✅ 여러 지표 확인 (추세 + 모멘텀 + 거래량)
✅ 백테스팅으로 검증
✅ 시장 환경별 조정
✅ 거짓 신호 필터링

### DON'T
❌ 지표만으로 판단
❌ 너무 많은 지표 (혼란)
❌ 지표 최적화 함정 (과최적화)
❌ 레인징 시장에서 추세 지표 사용

## 지표별 최적 시장

| 지표 | 추세장 | 레인징 |
|------|--------|--------|
| MA / MACD | ✅ | ❌ |
| RSI / Stochastic | ❌ | ✅ |
| ADX | ✅ | ❌ |
| Bollinger Bands | ✅ | ✅ |
| OBV | ✅ | ❌ |

## 참고 문헌

- John Murphy, "Technical Analysis of the Financial Markets"
- J. Welles Wilder, "New Concepts in Technical Trading Systems" (RSI, ATR)
- Thomas DeMark, "The New Science of Technical Analysis"
