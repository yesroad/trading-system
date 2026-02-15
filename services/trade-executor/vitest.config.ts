import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.integration.test.ts'],
    testTimeout: 30000, // 통합 테스트는 시간이 오래 걸릴 수 있음
    hookTimeout: 30000,
  },
});
