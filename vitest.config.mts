import { defineConfig } from 'vitest/config';

// 순수 로직(src/core)만 Node에서 테스트한다. 화면·네이티브 연동은 실기기에서 확인.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
