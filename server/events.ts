import type { ServerResponse } from 'node:http';

const encode = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

export class EventHub {
  private clients = new Set<ServerResponse>();
  private heartbeat = setInterval(() => this.write(': ping\n\n'), 25000);
  connect(res: ServerResponse) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' });
    res.write('retry: 1500\n\n');
    this.clients.add(res);
    res.on('close', () => this.clients.delete(res));
  }
  send(event: string, data: unknown) { this.write(encode(event, data)); }
  close() { clearInterval(this.heartbeat); for (const c of this.clients) c.end(); this.clients.clear(); }
  private write(chunk: string) { for (const c of this.clients) c.write(chunk); }
}
