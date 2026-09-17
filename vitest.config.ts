import { defineConfig } from 'vitest/config';
import { existsSync } from 'node:fs';

const setupFile = 'tests/setup.ts';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: existsSync(setupFile) ? [setupFile] : [],
    fileParallelism: false,
  },
});
