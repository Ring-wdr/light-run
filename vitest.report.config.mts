import { defineConfig } from 'vitest/config';

// 튜닝용 리포트(tests/report). npm test에는 포함되지 않는다.
export default defineConfig({
  test: {
    include: ['tests/report/**/*.report.ts'],
    environment: 'node',
    silent: false,
  },
});
