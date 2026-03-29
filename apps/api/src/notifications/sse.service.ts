import { Injectable } from '@nestjs/common';
import type { Response } from 'express';

@Injectable()
export class SseService {
  private clients = new Map<string, Set<Response>>();

  addClient(userId: string, res: Response): void {
    if (!this.clients.has(userId)) {
      this.clients.set(userId, new Set());
    }
    this.clients.get(userId)!.add(res);

    res.on('close', () => {
      this.clients.get(userId)?.delete(res);
    });
  }

  push(userId: string, data: Record<string, unknown>): void {
    const connections = this.clients.get(userId);
    if (!connections) return;
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const res of connections) {
      try {
        res.write(payload);
      } catch {
        connections.delete(res);
      }
    }
  }
}
