// Internal worker types — aligned with the flow_cache and darkpool_cache schemas.

export interface FlowRow {
  polygon_id: string;
  ticker: string;
  flow_type: 'CALL' | 'PUT';
  strike: number;
  expiry: string;
  dte: number;
  order_type: 'SWEEP' | 'BLOCK' | 'SPLIT';
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  premium: number;
  total_premium: number;
  price: number;
  size: number;
  open_interest: number | null;
  iv: number | null;
  is_sweep: boolean;
  is_unusual: boolean;
  traded_at: string;
}

export interface DarkPoolRow {
  polygon_id: string;
  ticker: string;
  price: number;
  size: number;
  notional: number;
  exchange: string;
  traded_at: string;
  raw: Record<string, unknown>;
}

export interface PolygonOptionsTrade {
  ev: string;
  sym: string;
  p: number;
  s: number;
  t: number;
  c: number[];
  x: number;
  i: string;
}
