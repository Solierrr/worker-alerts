import { DurableObject } from "cloudflare:workers";
import type { MonitorStore } from "./monitor";

// Estado do monitor, numa única instância: última batida do heartbeat, contagem de falhas seguidas da
// sonda e desde quando cada incidente do monitor está aberto.
export class MonitorState extends DurableObject<Env> implements MonitorStore {
  async recordHeartbeat(at: number): Promise<void> {
    await this.ctx.storage.put("heartbeat", at);
  }

  async lastHeartbeat(): Promise<number | undefined> {
    return this.ctx.storage.get<number>("heartbeat");
  }

  // Horário da primeira verificação: antes da primeira batida, é dele que o heartbeat conta
  async baseline(now: number): Promise<number> {
    const stored = await this.ctx.storage.get<number>("baseline");
    if (stored !== undefined) return stored;
    await this.ctx.storage.put("baseline", now);
    return now;
  }

  async markPaused(at: number): Promise<void> {
    await this.ctx.storage.put("paused", at);
  }

  async lastPaused(): Promise<number | undefined> {
    return this.ctx.storage.get<number>("paused");
  }

  async countProbe(name: string, ok: boolean): Promise<number> {
    const key = `failures:${name}`;
    const failures = ok
      ? 0
      : ((await this.ctx.storage.get<number>(key)) ?? 0) + 1;
    await this.ctx.storage.put(key, failures);
    return failures;
  }

  async openedAt(key: string): Promise<number | undefined> {
    return this.ctx.storage.get<number>(`open:${key}`);
  }

  async setOpenedAt(key: string, at: number | undefined): Promise<void> {
    if (at === undefined) await this.ctx.storage.delete(`open:${key}`);
    else await this.ctx.storage.put(`open:${key}`, at);
  }
}
