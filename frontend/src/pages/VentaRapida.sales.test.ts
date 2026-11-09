import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(process.cwd(), 'src/pages/VentaRapida.tsx'), 'utf8');
const envExample = readFileSync(resolve(process.cwd(), '.env.example'), 'utf8');

describe('barrera de cobro Supabase', () => {
  it('mantiene apagado el feature flag por defecto', () => {
    expect(envExample).toMatch(/VITE_SUPABASE_SALES_ENABLED=false/);
    expect(source).toMatch(/VITE_SUPABASE_SALES_ENABLED !== 'true'/);
  });

  it('protege contra doble clic y conserva carrito si RPC falla', () => {
    expect(source).toMatch(/if \(cobroEnCurso\.current\) return/);
    expect(source).toMatch(/cobroEnCurso\.current = false/);
    expect(source).toMatch(/no se permite enviar ventas al backend NestJS ni a la cola antigua/);
  });

  it('solo vacía carrito tras finalizar el flujo sin excepción', () => {
    expect(source.indexOf('setLineas([])')).toBeGreaterThan(source.indexOf('await crearVentaSupabase'));
    expect(source).toMatch(/limpiarClaveVentaSupabase\(storageScope\)/);
  });
});
