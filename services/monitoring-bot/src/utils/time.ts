export function diffMinutes(from: Date, to: Date) {
  return (to.getTime() - from.getTime()) / 60000;
}

export function toKstIso(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;
  const kst = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  return kst.toISOString();
}
