# KIS API Rate Limits

## 공식 한도

**한국투자증권 Open API:**
- 초당 20회 (1,200회/분) - 기본
- 일부 API는 더 낮은 한도 적용
- App Key 기준 제한

**토큰 발급:**
- 하루 1회 권장
- 24시간 유효

참고: https://apiportal.koreainvestment.com/

---

## 현재 설정

### 백오프 기반 요청
```typescript
const backoff = createBackoff({
  baseMs: 1000,      // 초기 대기: 1초
  maxMs: 30000,      // 최대 대기: 30초
  jitterMs: 500,     // 지터: ±500ms
});
```

**선정 이유:**
- 초기 간격: 1초 (공식 한도의 5% 수준, 매우 보수적)
- 에러 발생 시 지수적 증가
- 지터로 동시 요청 분산

### 토큰 관리
- `@workspace/kis-auth` 패키지 사용
- DB 기반 토큰 저장 (`system_guard` 테이블)
- 쿨다운 메커니즘 (60초)

---

## 환경변수

```bash
# 백오프 기본 간격 (ms)
KIS_BACKOFF_BASE_MS=1000

# 백오프 최대 간격 (ms)
KIS_BACKOFF_MAX_MS=30000

# 백오프 지터 (ms)
KIS_BACKOFF_JITTER_MS=500

# Tick 간격 (ms)
KIS_TICK_MS=200
```

---

## 한도 초과 시 대응

### HTTP 429 또는 "API 호출 한도 초과"
- 백오프 적용: 1초 → 2초 → 4초 → 8초 → ... (최대 30초)
- `TokenCooldownError` throw
- 60초 쿨다운

### 토큰 관련 에러
- `token_cooldown_until` 체크
- 쿨다운 중이면 요청 건너뜀
- monitoring-bot에서 쿨다운 감지 시 알림

---

## 모니터링

### 현재
- `worker_status` 테이블에 상태 기록
- `ingestion_runs` 테이블에 성공/실패 기록
- TokenCooldownError 로깅

### 추가 권장
- 429 에러 발생 시 즉시 알림
- 토큰 쿨다운 빈도 추적
- 시간대별 요청 성공률 모니터링

---

## 최적화 전략

### Tick 기반 스케줄링
- 200ms tick으로 심볼별 폴링
- 각 심볼마다 독립적인 lastRunAt 추적
- 실패 시 백오프 적용

### 장시간 체크
- 주말/휴장일: 요청 스킵
- 장 시작 전: 간격 연장
- 장중: 정상 간격

---

**마지막 업데이트:** 2026-02-15
