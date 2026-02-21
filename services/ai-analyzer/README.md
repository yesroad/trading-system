# ai-analyzer

주식(KR/US) 및 코인(CRYPTO) 시장 데이터를 기반으로  
**“AI를 언제, 왜 호출할지”를 엄격하게 제어하는 분석 서비스**입니다.

❗ 이 서비스의 핵심 목표는  
**AI를 많이 부르는 것 ❌  
의미 있을 때만 정확하게 부르는 것 ✅** 입니다.

---

## 1. 전체 역할 요약

ai-analyzer는 다음 순서로 동작합니다.

1. 시장 상태 스냅샷 수집
2. 분석 대상(symbol) 자동 선정
3. **데이터 변화가 있을 때만 AI 호출 여부 판단**
4. 쿨다운 / 예산 제한 최종 체크
5. LLM 호출
6. 분석 결과를 **symbol 단위로 저장**
7. (향후) trade-executor가 결과를 참조

---

## 2. 지원 시장 / 모드

### 시장(Market)

- `KR` : 국내 주식
- `US` : 미국 주식
- `CRYPTO` : 코인 (24/7)

### 모드(MarketMode)

| 모드           | 의미                   |
| -------------- | ---------------------- |
| `PRE_OPEN`     | 장 시작 전 리스크 체크 |
| `INTRADAY`     | 장중 실시간 판단       |
| `CLOSE`        | 장 마감 직전 판단      |
| `POST_CLOSE`   | 장 마감 후 요약        |
| `OFF`          | 비활성                 |
| `CRYPTO`       | 코인 장중              |
| `CRYPTO_DAILY` | 코인 일 1회 요약       |

❗ `OFF` 모드는 **애초에 AI 분석 대상에서 제외**

---

## 3. 실행 방식 (중요)

### 🔹 1회성 잡 방식 (현재 채택)

ai-analyzer는 **계속 떠있는 데몬이 아님**.

- 크론 / pm2 cron / GitHub Actions 등에서
- **1회 실행 → 조건 만족 시 AI 호출 → 종료**

```text
[실행]
→ runAiAnalysis(KR, mode)
→ runAiAnalysis(US, mode)
→ runAiAnalysis(CRYPTO, mode)
→ 종료
```

---

## 4. HOLD 편향 완화(2026-02 반영)

- 기본 LLM temperature를 `AI_LLM_TEMPERATURE`로 제어한다. (기본: `0.35`)
- 결과가 HOLD로 과도하게 쏠리면 1회 재시도한다.
  - 조건: BUY/SELL 0건 + HOLD 비율이 `AI_HOLD_RETRY_THRESHOLD` 이상
  - 재시도 temperature: `AI_HOLD_RETRY_TEMPERATURE` (기본: `0.45`)
  - 재시도 토글: `AI_HOLD_RETRY_ENABLED` (기본: `true`)
- 재시도 프롬프트는 방향성(BUY/SELL) 우선 판단을 강제하고, HOLD는 예외적으로만 허용한다.

## 5. 운영 팁

- 5시간 이상 신호가 0건이면 아래 순서로 점검한다.
  1. `ai_analysis_results`의 decision 분포(HOLD 편향 여부)
  2. `trading_signals` 생성 건수
  3. `signal_generation_failures` 사유 상위 항목
  4. `MIN_CONFIDENCE` / 이벤트 게이트 임계값
