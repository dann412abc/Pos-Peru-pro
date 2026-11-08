export interface Env {
  POS_API_ORIGIN: string;
  CRON_SECRET: string;
}

export default {
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(ejecutar(env));
  },
};

async function ejecutar(env: Env): Promise<void> {
  if (!env.POS_API_ORIGIN || !env.CRON_SECRET) throw new Error('Faltan POS_API_ORIGIN o CRON_SECRET');
  const base = env.POS_API_ORIGIN.replace(/\/+$/, '');
  const response = await fetch(`${base}/api/internal/cron/alertas`, {
    method: 'POST',
    headers: { 'x-cron-secret': env.CRON_SECRET, 'content-type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Cron POS respondió ${response.status}: ${detail}`);
  }
  const result = await response.json() as { administradores?: number; procesados?: number; alertas?: number; errores?: unknown[] };
  if ((result.errores?.length || 0) > 0) throw new Error(`Cron ejecutado con ${result.errores?.length} error(es); procesados ${result.procesados || 0}/${result.administradores || 0}`);
}
