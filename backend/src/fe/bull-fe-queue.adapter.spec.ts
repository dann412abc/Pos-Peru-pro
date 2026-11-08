import { BullFeQueueAdapter } from './bull-fe-queue.adapter';
import { Queue } from 'bull';

describe('BullFeQueueAdapter', () => {
  it('delegates job name, payload and retry options to Bull', async () => {
    const add = jest.fn().mockResolvedValue({ id: 'job-1' });
    const adapter = new BullFeQueueAdapter({ add } as unknown as Queue);
    const payload = { ceId: 42 };
    const options = { attempts: 5, backoff: { type: 'exponential' as const, delay: 5000 } };

    await expect(adapter.add('enviar-comprobante', payload, options)).resolves.toEqual({ id: 'job-1' });
    expect(add).toHaveBeenCalledWith('enviar-comprobante', payload, options);
  });
});
