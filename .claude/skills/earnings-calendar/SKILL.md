# Earnings Calendar Skill

The earnings-calendar skill retrieves upcoming earnings announcements for US stocks using the Financial Modeling Prep (FMP) API. It focuses on mid-cap and larger companies (>$2B market cap) that significantly impact markets.

## 개요

`earnings-calendar` 스킬은 Financial Modeling Prep(FMP) API를 사용해 미국 주식의 향후 실적 발표 일정을 가져옵니다. 시장 영향력이 큰 중형주 이상(시가총액 20억 달러 초과)에 초점을 둡니다.

## 주요 기능

- **FMP API 연동**: 구조화된 실적 일정 데이터 안정 수집
- **시가총액 필터링**: 20억 달러 초과 기업 중심 선별
- **다중 환경 지원**: CLI, Desktop, Web 환경 호환
- **정렬된 출력**: 날짜, 발표 시점(BMO/AMC/TAS), 시가총액 기준 마크다운 리포트
- **유연한 API 키 관리**: 환경 변수, 세션 입력, 수동 입력 지원

## 핵심 워크플로

### 1. 날짜 계산

현재 날짜를 구하고 다음 7일 범위(YYYY-MM-DD)를 계산합니다.

### 2. FMP API 가이드 로드

엔드포인트, 파라미터, 인증, 모범 사례를 위해 `references/fmp_api_guide.md`를 참조합니다.

### 3. API 키 설정

- **CLI/Desktop**: 환경 변수 `FMP_API_KEY` 확인
- **Web**: 사용자에게 키 입력 요청(세션 한정 저장)
- **대안**: 수동 데이터 입력 옵션 제공

### 4. 실적 데이터 조회

날짜 범위와 API 키로 `scripts/fetch_earnings_fmp.py` 실행:

```
python scripts/fetch_earnings_fmp.py START_DATE END_DATE [API_KEY]
```

출력: 심볼, 회사명, 날짜, 발표 시점, 시가총액, 섹터, EPS/매출 추정치를 포함한 JSON

### 5. 데이터 처리 및 정렬

- JSON 파싱
- 필수 필드 검증
- 날짜 → 발표 시점 → 시가총액(내림차순)으로 그룹/정렬
- 요약 통계 계산

### 6. 리포트 생성

`scripts/generate_report.py`로 포맷된 마크다운 리포트 생성:

```
python scripts/generate_report.py earnings_data.json output_filename.md
```

### 7. 품질 검증

모든 날짜가 대상 주간 범위 내인지, 시가총액/발표 시점이 누락되지 않았는지, 정렬 및 통계가 정확한지 확인합니다.

### 8. 결과 전달

`earnings_calendar_[YYYY-MM-DD].md` 규칙으로 저장하고 요약을 사용자에게 전달합니다.

## 사전 준비

**FMP API Key (무료):**

1. https://site.financialmodelingprep.com/developer/docs 접속
2. 무료 계정 생성
3. API 키 즉시 발급
4. 무료 플랜: 일 250회 요청

## 발표 시점 기준

- **BMO**: 장 시작 전(미 동부 약 06:00~08:00)
- **AMC**: 장 마감 후(미 동부 약 16:00~17:00)
- **TAS**: 시간 미정

## 시가총액 구간

- 메가캡: 2,000억 달러 초과
- 라지캡: 100억~2,000억 달러
- 미드캡: 20억~100억 달러

## 사용 시점

실적 캘린더, 예정된 실적 발표, 기업 보고 일정 조회 요청 시 이 스킬을 사용합니다.

## 리소스

- FMP 문서: https://site.financialmodelingprep.com/developer/docs
- 스킬 참고 자료: `references/fmp_api_guide.md`, `scripts/`, `assets/` 템플릿
