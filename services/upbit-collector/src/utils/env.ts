import 'dotenv/config';

export function env(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[upbit-collector] 환경변수 누락: ${name}`);
    throw new Error(`${name} is missing`);
  }
  return v;
}
