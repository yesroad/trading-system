## 데이터 연동 방식 (필수)

- 대시보드 화면은 Supabase 테이블을 직접 조회하지 않는다.
- 모든 데이터는 `apps/web/src/app/api/snapshot/route.ts`의 **Snapshot API**를 통해서만 가져온다.
- 즉, 화면은 `/api/snapshot` 응답(JSON)을 그대로 렌더링하는 구조로 구현한다.
- DB명은 services쪽 코드와 supabase를 확인 후 명확한 내용으로 작업한다.

### Snapshot API가 제공해야 하는 정보

#### 1) 상단 공통 요약(시장별)

시장 단위로 아래 값을 내려준다 (CRYPTO / US / KR):

- 상태: 정상/지연/중단 (지연 기준은 서버에서 계산)
- 최근 수집 시각(분 단위 lag)
  - 소스: `ingestion_runs` (시장별 job)
- 최근 AI 분석 시각(분 단위 lag)
  - 소스: `ai_analysis_results`
- 위험도 분포
  - `HIGH / MEDIUM / LOW` 개수
  - 소스: `ai_analysis_results` (market 기준)

#### 2) 탭 콘텐츠(시장별 상세)

선택된 시장(market)에 대해 아래 데이터를 내려준다:

- 대상 종목 수
- 최근 수집 시각(lag)
- 최근 AI 분석 시각(lag)
- 위험도 분포(H/M/L count)
- 리스트 데이터(최근 N건)
  - `symbol`
  - `risk_level`
  - `confidence`
  - `summary`
  - `reasons` (상세 펼침용)
  - `decision` (ALLOW/CAUTION/BLOCK)
  - `created_at`

#### 3) “보유 종목만” 필터 지원

- 응답에는 보유 종목 목록(또는 보유 여부 맵)을 포함한다.
- 소스: `positions` (market별)
- UI는 snapshot 응답 기반으로 “보유 종목만” 필터를 적용한다.

### 추가 요구

- `/api/snapshot`은 `force=1` 파라미터로 캐시 무시 가능해야 한다.
- lag(몇 분 전) 계산은 서버에서 처리해서 내려준다. (UI에서 계산 금지)
