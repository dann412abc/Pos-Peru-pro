/// <reference types="vite/client" />

// Declaración de variables de entorno de Vite para TypeScript.
interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_DEMO_MODE: string;
  readonly VITE_AUTH_PROVIDER: string;
  readonly VITE_SUPABASE_SALES_ENABLED: string;
  readonly VITE_COMPROBANTE_URL_BASE: string;
  readonly DEV: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
