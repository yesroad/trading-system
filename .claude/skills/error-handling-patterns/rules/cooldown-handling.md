# TokenCooldownError 처리

KIS API 토큰 쿨다운 에러를 처리하는 패턴입니다.

## TokenCooldownError란?

KIS API 토큰 발급이 실패하면 60초간 재시도를 방지하는 쿨다운 메커니즘이 작동합니다.
이 기간 동안 토큰 획득을 시도하면 `TokenCooldownError`가 발생합니다.

## 기본 처리 패턴

```typescript
import { TokenManager, TokenCooldownError } from '@workspace/kis-auth';
import { createLogger } from '@workspace/shared-utils';

const logger = createLogger('kis-service');
const tokenManager = new TokenManager();

async function callKisApi() {
  try {
    const token = await tokenManager.getToken();
    // API 호출
    return await kisApiCall(token);
  } catch (error) {
    if (error instanceof TokenCooldownError) {
      logger.info('토큰 쿨다운 중', {
        remainingMs: error.remainingMs,
        willRetryAt: new Date(Date.now() + error.remainingMs).toISOString()
      });
      // 쿨다운 중에는 스킵하거나 대기
      return null;  // 또는 throw
    }
    throw error;
  }
}
```

## 처리 전략

### 1. 스킵 전략 (권장)

쿨다운 중에는 작업을 스킵하고 다음 루프에서 재시도합니다.

```typescript
async function mainLoop() {
  while (true) {
    try {
      const token = await getTokenSafe();
      if (!token) {
        logger.info('토큰 없음, 다음 루프에서 재시도');
        await sleep(5000);  // 5초 대기
        continue;
      }

      // API 호출
      const data = await callKisApi(token);
      await processData(data);

    } catch (error) {
      logger.error('루프 실패', { error });
    }

    await sleep(1000);  // 1초 대기
  }
}

async function getTokenSafe(): Promise<string | null> {
  try {
    return await tokenManager.getToken();
  } catch (error) {
    if (error instanceof TokenCooldownError) {
      return null;  // 쿨다운 중
    }
    throw error;
  }
}
```

### 2. 대기 전략

쿨다운이 끝날 때까지 대기합니다.

```typescript
async function callKisApiWithWait() {
  while (true) {
    try {
      const token = await tokenManager.getToken();
      return await kisApiCall(token);
    } catch (error) {
      if (error instanceof TokenCooldownError) {
        logger.info('쿨다운 대기 중', {
          waitMs: error.remainingMs
        });
        await sleep(error.remainingMs + 1000);  // 쿨다운 + 1초 여유
        continue;  // 재시도
      }
      throw error;
    }
  }
}
```

### 3. 즉시 실패 전략

쿨다운 중에는 즉시 에러를 발생시킵니다.

```typescript
async function callKisApiStrict() {
  try {
    const token = await tokenManager.getToken();
    return await kisApiCall(token);
  } catch (error) {
    if (error instanceof TokenCooldownError) {
      logger.error('토큰 쿨다운 중', {
        remainingMs: error.remainingMs
      });
      throw new Error('KIS token is in cooldown period');
    }
    throw error;
  }
}
```

## kis-collector에서의 실제 사용

```typescript
// kis-collector/src/index.ts에서 발췌

async function mainLoop() {
  const symbolSchedulers = new Map<string, SymbolScheduler>();

  while (true) {
    try {
      // 심볼 목록 리프레시
      const symbols = await loadActiveKisKrxSymbols();

      for (const symbol of symbols) {
        let scheduler = symbolSchedulers.get(symbol);
        if (!scheduler) {
          scheduler = new SymbolScheduler(symbol);
          symbolSchedulers.set(symbol, scheduler);
        }

        const shouldRun = scheduler.shouldRun();
        if (!shouldRun) continue;

        try {
          // 1. 토큰 획득 시도
          const token = await getTokenSafe();
          if (!token) {
            // 쿨다운 중 - 이번 심볼 스킵
            logger.debug('토큰 쿨다운, 심볼 스킵', { symbol });
            continue;
          }

          // 2. 가격 조회
          const price = await fetchKrxPrice(symbol, token);

          // 3. DB 저장
          await insertTick(symbol, price);

          // 4. 성공 - 백오프 리셋
          scheduler.onSuccess();

        } catch (error) {
          // 실패 - 백오프 증가
          scheduler.onFailure();
          logger.error('심볼 처리 실패', { symbol, error });
        }
      }

    } catch (error) {
      logger.error('메인 루프 실패', { error });
    }

    await sleep(200);  // 200ms 틱
  }
}

async function getTokenSafe(): Promise<string | null> {
  try {
    return await tokenManager.getToken();
  } catch (error) {
    if (error instanceof TokenCooldownError) {
      logger.info('토큰 쿨다운 중', {
        remainingMs: error.remainingMs,
        willRetryAt: new Date(Date.now() + error.remainingMs).toISOString()
      });
      return null;
    }
    throw error;
  }
}
```

## 쿨다운 상태 확인

```typescript
// system_guard 테이블에서 쿨다운 상태 직접 확인
async function checkCooldownStatus() {
  const { data, error } = await getSupabase()
    .from('system_guard')
    .select('token_cooldown_until')
    .eq('id', 'default')
    .single();

  if (error) throw new Error(error.message);

  if (!data.token_cooldown_until) {
    logger.info('쿨다운 없음');
    return { inCooldown: false, remainingMs: 0 };
  }

  const cooldownUntil = new Date(data.token_cooldown_until);
  const now = new Date();
  const remainingMs = cooldownUntil.getTime() - now.getTime();

  if (remainingMs <= 0) {
    logger.info('쿨다운 만료');
    return { inCooldown: false, remainingMs: 0 };
  }

  logger.info('쿨다운 중', {
    remainingMs,
    cooldownUntil: cooldownUntil.toISOString()
  });
  return { inCooldown: true, remainingMs };
}
```

## 베스트 프랙티스

1. **쿨다운은 즉시 전파**
   ```typescript
   // ✅ 좋음: 즉시 null 반환
   if (error instanceof TokenCooldownError) {
     return null;
   }

   // ❌ 나쁨: 쿨다운 무시하고 재시도
   if (error instanceof TokenCooldownError) {
     await sleep(1000);
     return await tokenManager.getToken();  // 또 실패
   }
   ```

2. **쿨다운 로그는 info 레벨**
   ```typescript
   // ✅ 좋음: 정상 동작이므로 info
   logger.info('토큰 쿨다운 중', { remainingMs });

   // ❌ 나쁨: 에러가 아님
   logger.error('토큰 쿨다운', { remainingMs });
   ```

3. **remainingMs 활용**
   ```typescript
   // ✅ 좋음: 정확한 대기 시간
   await sleep(error.remainingMs + 1000);

   // ❌ 나쁨: 고정 시간 대기
   await sleep(60000);  // 항상 60초
   ```

4. **쿨다운 중에는 다른 작업 수행**
   ```typescript
   // ✅ 좋음: 쿨다운 중 다른 작업
   if (!token) {
     // KIS API 대신 다른 작업
     await processLocalData();
     return;
   }

   // ❌ 나쁨: 아무것도 안 함
   if (!token) {
     return;  // 시간 낭비
   }
   ```

---

**관련 문서:**
- [KIS Auth - TokenManager](../../../../packages/kis-auth/README.md)
- [에러 분류](./error-classification.md)
