import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parse } from 'dotenv';

function findWorkspaceRoot(startDir: string): string | null {
  let current = startDir;
  while (true) {
    const hasPackageJson = existsSync(join(current, 'package.json'));
    const hasTurboJson = existsSync(join(current, 'turbo.json'));
    if (hasPackageJson && hasTurboJson) return current;

    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function applyEnvFile(filePath: string, loadedByFile: Set<string>): void {
  if (!existsSync(filePath)) return;
  const raw = readFileSync(filePath, 'utf8');
  const parsed = parse(raw);

  for (const [key, value] of Object.entries(parsed)) {
    // Shell/PM2 주입값 우선, 파일 간에는 로컬(.env)이 루트(.env)를 덮어쓴다.
    if (process.env[key] === undefined || loadedByFile.has(key)) {
      process.env[key] = value;
      loadedByFile.add(key);
    }
  }
}

function loadWorkspaceEnv(): void {
  const cwd = process.cwd();
  const workspaceRoot = findWorkspaceRoot(cwd);
  if (!workspaceRoot) return;

  const loadedByFile = new Set<string>();

  applyEnvFile(join(workspaceRoot, '.env'), loadedByFile);
  applyEnvFile(join(workspaceRoot, '.env.local'), loadedByFile);

  if (cwd !== workspaceRoot) {
    applyEnvFile(join(cwd, '.env'), loadedByFile);
    applyEnvFile(join(cwd, '.env.local'), loadedByFile);
  }
}

loadWorkspaceEnv();
