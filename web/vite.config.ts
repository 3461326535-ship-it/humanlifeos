import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// 挂在子路径 /app，打包产物引用必须带 base
export default defineConfig({
  base: '/app/',
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: 5180,
    proxy: {
      // 本地开发时代理到服务器（改为你可访问的地址）
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
