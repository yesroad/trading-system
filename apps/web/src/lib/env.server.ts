export function envServer(name: string): string {
  const v = process.env[name];
  console.log(v);
  if (!v) {
    throw new Error(`[web/api] 환경변수 누락: ${name}`);
  }
  return v;
}
