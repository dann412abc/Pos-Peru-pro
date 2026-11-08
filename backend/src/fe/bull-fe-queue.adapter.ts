import { Inject, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { FE_QUEUE_NAME } from './queue.port';
import { FeQueueOptions, FeQueuePort } from './queue.port';

/** Adaptador transitorio Bull. Conserva la cola actual mientras se migra el runtime. */
@Injectable()
export class BullFeQueueAdapter implements FeQueuePort {
  constructor(@InjectQueue(FE_QUEUE_NAME) private readonly queue: Queue) {}

  add<T extends Record<string, unknown>>(name: string, payload: T, options?: FeQueueOptions) {
    return this.queue.add(name, payload, options);
  }
}
