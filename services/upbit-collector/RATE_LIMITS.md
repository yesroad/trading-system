# Upbit API Rate Limits

## 공식 한도

**공개 API (캔들, 시세 등):**
- 초당 10회 (600회/분)
- IP 기준 제한

**개인 정보 조회 API (잔고, 주문 등):**
- 초당 8회 (480회/분)
- Access Key 기준 제한

**주문 API:**
- 초당 8회
- 분당 200회
- Access Key 기준 제한

참고: https://docs.upbit.com/docs/user-request-guide

---

## 현재 설정

### 캔들 수집
```typescript
// 요청 간격: 120ms (초당 ~8.3회)
await sleep(120);
```

**선정 이유:**
- 공개 API 한도(10회/초)의 80% 수준
- 안전 마진 20% 확보
- 30개 심볼 수집 시 약 3.6초 소요

### KRW 잔액 조회
```typescript
// JWT 서명 필요
await fetchKRWBalance();
```

**빈도:**
- SCAN_INTERVAL마다 (기본 60초)
- 개인 정보 조회 API 한도 내

---

## 환경변수

```bash
# 요청 간격 (ms)
UPBIT_REQUEST_DELAY_MS=120

# 스캔 간격 (ms)
UPBIT_SCAN_INTERVAL_MS=60000

# 루프 간격 (ms)
LOOP_INTERVAL_MS=10000
```

---

## 한도 초과 시 대응

### HTTP 429 응답
- `Retry-After` 헤더 확인
- 지수 백오프 적용: 1초 → 2초 → 4초 (최대 30초)

### 현재 구현
```typescript
// 에러 발생 시 루프 계속 (다음 사이클에서 재시도)
catch (e) {
  console.error(`[업비트 수집기] 오류 발생`, e);
  // ingestion_runs에 실패 기록
}
```

**개선 필요:**
- 429 에러 감지 시 백오프 추가
- monitoring-bot에서 429 에러 알림

---

## 모니터링

### 현재
- `ingestion_runs` 테이블에 성공/실패 기록
- `worker_status` 테이블에 상태 기록

### 추가 권장
- 429 에러 발생 시 Slack/Telegram 즉시 알림
- 일일 리포트에 레이트 리밋 히트 횟수 포함
- 시간대별 요청 빈도 추적

---

## 최적화 전략

### 우선순위 기반 수집
1. 보유 자산 (항상 수집)
2. DB 등록 종목 (관심 종목)
3. 거래대금 상위 (자동 선정)

### 동적 간격 조정 (향후)
- 거래량 많은 시간대: 간격 단축 (100ms)
- 거래량 적은 시간대: 간격 연장 (200ms)
- 429 에러 발생 시: 간격 2배 증가

---

**마지막 업데이트:** 2026-02-15
