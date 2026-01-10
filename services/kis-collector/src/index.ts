import { insertTick } from "./insertTick.js";

/**
 * KIS 가격 수집 워커 엔트리 포인트
 *
 * - 일정 주기로 가격 tick을 생성/수집
 * - insertTick을 통해 DB에 저장
 * - 현재는 임시 데이터, 이후 KIS API로 교체 예정
 */

const intervalMs = 1000;
let isRunning = false;

console.log("[kis-collector] started");

setInterval(async () => {
  if (isRunning) return;
  isRunning = true;

  try {
    const ts = new Date().toISOString();
    const price = Math.floor(70000 + Math.random() * 500); // TODO: KIS API 연동

    await insertTick({
      symbol: "KRX:005930",
      ts,
      price,
      raw: { source: "heartbeat" },
    });

    console.log("[inserted]", ts, price);
  } catch (e) {
    console.error("[collector error]", e);
  } finally {
    isRunning = false;
  }
}, intervalMs);
