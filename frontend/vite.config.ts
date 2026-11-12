import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Configuración de Vite para Mi Carrito POS
// El proxy hacia el backend se puede activar aquí si se desea desarrollar sin CORS.
export default defineConfig({
  plugins: [react()],
  test: {
    // La suite de Vitest cubre pruebas unitarias del frontend.
    // Los contratos de Cloudflare/Edge y Supabase se ejecutan por sus pasos Node dedicados en CI.
    include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}', 'functions/api/edge/edge.test.js'],
    environment: 'node',
  },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
