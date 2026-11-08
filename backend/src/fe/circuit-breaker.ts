/**
 * Circuit Breaker basico para el envio de comprobantes electronicos.
 *  - CLOSED: flujo normal.
 *  - OPEN: tras 5 fallos consecutivos; se rechazan nuevos envios durante 30s.
 *  - HALF_OPEN: tras 30s, se permite UN intento; si acierta -> CLOSED, si falla -> OPEN.
 */
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private fallosConsecutivos = 0;
  private openedAt = 0;

  constructor(
    private readonly umbralFallos = 5,
    private readonly timeoutMs = 30_000,
  ) {}

  getState(): CircuitState {
    if (this.state === 'OPEN' && Date.now() - this.openedAt >= this.timeoutMs) {
      this.state = 'HALF_OPEN';
    }
    return this.state;
  }

  /** Permite un nuevo intento? Si el breaker esta OPEN, no. */
  permitirIntento(): boolean {
    const estado = this.getState();
    return estado !== 'OPEN';
  }

  registrarExito(): void {
    this.fallosConsecutivos = 0;
    this.state = 'CLOSED';
  }

  registrarFallo(): void {
    this.fallosConsecutivos += 1;
    if (this.fallosConsecutivos >= this.umbralFallos) {
      this.state = 'OPEN';
      this.openedAt = Date.now();
    } else {
      this.state = 'CLOSED';
    }
  }

  getFallosConsecutivos(): number {
    return this.fallosConsecutivos;
  }

  reset(): void {
    this.fallosConsecutivos = 0;
    this.state = 'CLOSED';
    this.openedAt = 0;
  }
}

/** Instancia singleton para la cola de FE. */
export const feCircuitBreaker = new CircuitBreaker(5, 30_000);
