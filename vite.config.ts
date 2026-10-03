import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // 静的ホスティングのサブパス配信（GitHub Pages 等）でも動くよう相対パスにする
  base: './',
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
  },
});
