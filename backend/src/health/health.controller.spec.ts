import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('responde disponible cuando PostgreSQL responde', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    const response = { status: jest.fn() };
    const controller = new HealthController(dataSource as any);
    const result = await controller.check(response as any);
    expect(result.status).toBe('up');
    expect(result.baseDeDatos).toBe('ok');
    expect(response.status).not.toHaveBeenCalled();
  });

  it('marca degradado y no expone detalles del driver cuando PostgreSQL falla', async () => {
    const dataSource = { query: jest.fn().mockRejectedValue(new Error('password authentication failed for host private-db')) };
    const response = { status: jest.fn() };
    const controller = new HealthController(dataSource as any);
    const result = await controller.check(response as any);
    expect(result.status).toBe('degraded');
    expect(result.baseDeDatos).toBe('error');
    expect(JSON.stringify(result)).not.toContain('private-db');
    expect(response.status).toHaveBeenCalledWith(503);
  });
});
