import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Sitio 100% estático: todo se sirve desde el mismo origen (/public incluido).
export default defineConfig({
  plugins: [react()],
  build: { target: 'es2020', chunkSizeWarningLimit: 2000 },
});
