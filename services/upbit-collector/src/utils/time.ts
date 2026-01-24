export function utcIsoToKstLocalTimestamp(utcIso: string): string {
  const d = new Date(utcIso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`시간 파싱 실패(UTC): ${utcIso}`);
  }

  // sv-SE는 "YYYY-MM-DD HH:mm:ss" 형태로 안정적으로 나옴
  return d.toLocaleString('sv-SE', {
    timeZone: 'Asia/Seoul',
    hour12: false,
  });
}
