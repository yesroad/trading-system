# Yahoo Finance API Rate Limits

## 비공식 API 한도

**yfinance 라이브러리:**
- 공식 한도 문서 없음 (비공식 API)
- 커뮤니티 경험치 기반: 초당 1-2회 권장
- IP 기준 제한 (추정)

**과도한 요청 시:**
- HTTP 429 또는 403 응답
- 임시 차단 (1시간~24시간)

참고: https://github.com/ranaroussi/yfinance

---

## 현재 설정

### 보수적 요청 간격
```typescript
// 권장: 500ms~1000ms 간격
await sleep(1000);  // 1초 간격 (초당 1회)
```

**선정 이유:**
- 비공식 API이므로 매우 보수적으로 설정
- 장기적 안정성 우선
- IP 차단 위험 최소화

---

## 환경변수

```bash
# 요청 간격 (ms)
YF_REQUEST_DELAY_MS=1000

# 배치 크기
YF_BATCH_SIZE=10

# 루프 간격 (ms)
YF_LOOP_INTERVAL_MS=60000
```

---

## 한도 초과 시 대응

### HTTP 429 또는 403
- 즉시 요청 중단
- 지수 백오프: 5분 → 10분 → 30분 → 1시간
- monitoring-bot에서 알림

### 현재 구현
```typescript
// 에러 발생 시 루프 계속
catch (e) {
  console.error(`[YF 수집기] 오류`, e);
  // ingestion_runs에 실패 기록
}
```

**개선 필요:**
- 429/403 감지 시 장시간 백오프
- IP 차단 감지 시 알림

---

## 모니터링

### 현재
- `ingestion_runs` 테이블에 성공/실패 기록
- `worker_status` 테이블에 상태 기록

### 추가 권장
- 403/429 에러 즉시 알림
- 일일 요청 횟수 제한 (예: 5000회/일)
- 성공률 추적 (95% 미만 시 경고)

---

## 최적화 전략

### 요청 최소화
- 장 마감 후에만 수집 (일봉 기준)
- 보유 자산 + 관심 종목만 수집
- 중복 요청 방지 (캐싱)

### 대안 고려
- 공식 API 전환 (유료)
- Alpha Vantage, IEX Cloud 등
- Polygon.io (추천)

---

**경고:**
Yahoo Finance는 비공식 API이므로 언제든 변경/차단될 수 있습니다.
프로덕션 환경에서는 공식 API 사용을 권장합니다.

---

**마지막 업데이트:** 2026-02-15
