import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Percorsi relativi: il sito funziona sia alla radice di un dominio sia in una sottocartella (es. GitHub Pages).
  base: './',
  plugins: [react()],
  build: { target: 'es2022', sourcemap: true },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
