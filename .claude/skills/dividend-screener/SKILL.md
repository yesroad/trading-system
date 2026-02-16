# Value Dividend Screener Skill Documentation

## 개요

가치 배당 스크리너(Value Dividend Screener)는 밸류에이션 지표, 배당 기반 현금흐름, 펀더멘털 성장성을 결합해 고품질 배당주를 선별하는 종합 스크리닝 도구입니다. FINVIZ Elite로 1차 선별 후 Financial Modeling Prep(FMP) API로 정밀 분석하는 2단계 접근을 사용합니다.

## 핵심 기능

**주요 목적**: 배당수익률(3%+), 밸류에이션(P/E 20 미만, P/B 2 미만), 최근 3년 배당/매출/EPS 성장 추세를 포함한 정량 조건으로 미국 주식을 선별합니다.

**2단계 방법론:**

1. FINVIZ Elite로 후보를 사전 필터링(FMP API 사용량 최대 90% 절감)
2. FMP API로 종합 점수 기반의 정밀 펀더멘털 분석 수행

## 사용 시점

다음 요청에서 이 스킬을 사용합니다.

- 배당주 스크리닝 또는 인컴 포트폴리오 제안
- 펀더멘털이 견조한 가치주 탐색
- 지속가능한 수익률을 갖춘 고품질 배당 기회 발굴
- 밸류에이션과 배당 분석을 결합한 선별 요청

## 워크플로 요약

### API 설정

- `FMP_API_KEY`, `FINVIZ_API_KEY` 사용 가능 여부 확인
- 키가 없으면 설정 절차 안내
- 참고: FINVIZ Elite는 유료 구독 필요(연 약 $330)

### 실행 옵션

**2단계(권장):**

```bash
python3 scripts/screen_dividend_stocks.py --use-finviz
```

**FMP 단독:**

```bash
python3 scripts/screen_dividend_stocks.py
```

### 분석 출력

스크립트는 종목별 지표를 포함한 JSON을 생성합니다.

- 밸류에이션: 배당수익률, P/E, P/B
- 성장성: 배당/매출/EPS 3년 CAGR
- 지속가능성: 배당성향, FCF 커버리지 평가
- 품질: ROE, 이익률, 종합 점수

### 리포트 생성

다음 내용을 포함한 마크다운 리포트를 생성합니다.

- 종합 점수 기준 랭킹 테이블
- 상위 후보 종목 상세 분석
- 포트폴리오 구성 가이드
- 리스크 요인 및 모니터링 권고

## 리소스 파일

**scripts/screen_dividend_stocks.py**: API 연동, 다단계 필터링, CAGR 계산, 종합 점수화를 처리하는 메인 엔진

**references/screening_methodology.md**: 스크리닝 단계, 임계값 설정 근거, 투자 철학 상세 문서

**references/fmp_api_guide.md**: FMP API 설정 및 사용 가이드

## 성능 지표

- 2단계 실행 시간: 2~3분(대략 30~50개 FINVIZ 후보)
- FMP 단독 실행 시간: 5~15분(100~300+ 후보)
- API 절감 효과: 2단계 방식에서 FMP 호출 60~94% 절감
- 무료 플랜 적합성: 2단계 방식은 FMP 일 250회 한도 내 운영 가능

## 고급 커스터마이징

스크립트(383~388행)의 임계값을 조정해 배당수익률, P/E, P/B, 시가총액 조건을 변경할 수 있습니다. 섹터 필터링, REIT 제외, CSV 내보내기 기능은 코드 수정으로 확장할 수 있습니다.
