import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Configuración de Vite para Mi Carrito POS
// El proxy hacia el backend se puede activar aquí si se desea desarrollar sin CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
