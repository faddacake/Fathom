import WebSocket from 'ws';
import { logger } from './logger';
import type { PolygonOptionsTrade } from './types';

const WS_URL           = 'wss://socket.polygon.io/options';
const MIN_BACKOFF_MS   = 1_000;
const MAX_BACKOFF_MS   = 30_000;
const HEARTBEAT_MS     = 60_000; // reconnect if silent for 60 s during market hours

export type TradeHandler = (trade: PolygonOptionsTrade) => void;

export class PolygonWebSocket {
  private ws:             WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private backoff = MIN_BACKOFF_MS;
  private lastMessageAt = 0;
  private destroyed = false;

  constructor(
    private readonly apiKey: string,
    private readonly onTrade: TradeHandler,
  ) {}

  connect(): void {
    if (this.destroyed) return;
    logger.info({ msg: 'polygon ws connecting' });

    this.ws = new WebSocket(WS_URL);

    this.ws.on('open', () => {
      logger.info({ msg: 'polygon ws open' });
      this.backoff = MIN_BACKOFF_MS; // reset on successful connect
      this.resetHeartbeat();
    });

    this.ws.on('message', (data: Buffer) => {
      this.lastMessageAt = Date.now();
      this.resetHeartbeat();

      try {
        const msgs = JSON.parse(data.toString()) as Array<Record<string, unknown>>;
        for (const msg of msgs) this.handleMessage(msg);
      } catch (err) {
        logger.error({ msg: 'ws parse error', err: String(err) });
      }
    });

    this.ws.on('close', (code, reason) => {
      logger.warn({ msg: 'polygon ws closed', code, reason: reason.toString() });
      if (!this.destroyed) this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      logger.error({ msg: 'polygon ws error', err: err.message });
    });
  }

  private handleMessage(msg: Record<string, unknown>): void {
    switch (msg['ev']) {
      case 'connected':
        this.ws?.send(JSON.stringify({ action: 'auth', params: this.apiKey }));
        break;

      case 'auth_success':
        logger.info({ msg: 'polygon ws authenticated — subscribing T.*' });
        this.ws?.send(JSON.stringify({ action: 'subscribe', params: 'T.*' }));
        break;

      case 'auth_failed':
        logger.error({ msg: 'polygon ws auth failed — check POLYGON_API_KEY' });
        this.destroy();
        process.exit(1);
        break;

      case 'subscribed':
        logger.info({ msg: 'polygon ws subscribed', params: msg['params'] });
        break;

      case 'T':
        this.onTrade(msg as unknown as PolygonOptionsTrade);
        break;

      case 'status':
        logger.debug({ msg: 'polygon ws status', message: msg['message'] });
        break;
    }
  }

  private resetHeartbeat(): void {
    if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
    this.heartbeatTimer = setTimeout(() => {
      const idleSecs = Math.round((Date.now() - this.lastMessageAt) / 1_000);
      logger.warn({ msg: 'polygon ws idle — reconnecting', idle_secs: idleSecs });
      this.ws?.close();
    }, HEARTBEAT_MS);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.destroyed) return;
    const delay = this.backoff;
    logger.info({ msg: 'polygon ws scheduling reconnect', delay_ms: delay });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
      this.connect();
    }, delay);
  }

  destroy(): void {
    this.destroyed = true;
    if (this.heartbeatTimer)  clearTimeout(this.heartbeatTimer);
    if (this.reconnectTimer)  clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}
