import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  Object.assign(process.env, env);

  return {
    test: {
      include: ['test/**/*.test.ts'],
      exclude: ['node_modules', 'dist'],
      env,
      hookTimeout: 120_000,
      testTimeout: 120_000,
    },
  };
});
