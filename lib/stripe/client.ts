// lib/polygon/client.ts
// ─────────────────────────────────────────────────────────────
// Polygon.io REST client for Next.js API routes.
// Used by dashboard API endpoints to serve cached flow data.
// ─────────────────────────────────────────────────────────────

const POLYGON_BASE = 'https://api.polygon.io';
const API_KEY      = process.env.POLYGON_API_KEY!;

// ── Generic fetch wrapper ─────────────────────────────────────

async function polygonFetch<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(`${POLYGON_BASE}${path}`);
  url.searchParams.set('apiKey', API_KEY);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));

  const res = await fetch(url.toString(), {
    next: { revalidate: 3 }, // Next.js ISR — 3s cache
  });

  if (!res.ok) {
    throw new Error(`Polygon API error: ${res.status} ${res.statusText} — ${path}`);
  }

  return res.json();
}

// ── Market snapshot ───────────────────────────────────────────

export interface MarketSnapshot {
  spy:  TickerSnapshot;
  qqq:  TickerSnapshot;
  iwm:  TickerSnapshot;
  vix:  TickerSnapshot;
  qqq3: TickerSnapshot;
}

export interface TickerSnapshot {
  ticker:  string;
  price:   number;
  change:  number;
  changePct: number;
}

export async function getMarketSnapshot(): Promise<MarketSnapshot> {
  const tickers = ['SPY', 'QQQ', 'IWM', 'VIXY'];

  const data = await polygonFetch<any>('/v2/snapshot/locale/us/markets/stocks/tickers', {
    tickers: tickers.join(','),
  });

  const snap: Record<string, TickerSnapshot> = {};

  for (const item of data.tickers ?? []) {
    snap[item.ticker] = {
      ticker:    item.ticker,
      price:     item.day?.c ?? item.prevDay?.c ?? 0,
      change:    item.todaysChange ?? 0,
      changePct: item.todaysChangePerc ?? 0,
    };
  }

  return {
    spy:  snap['SPY']  ?? { ticker: 'SPY',  price: 0, change: 0, changePct: 0 },
    qqq:  snap['QQQ']  ?? { ticker: 'QQQ',  price: 0, change: 0, changePct: 0 },
    iwm:  snap['IWM']  ?? { ticker: 'IWM',  price: 0, change: 0, changePct: 0 },
    vix:  snap['VIXY'] ?? { ticker: 'VIX',  price: 0, change: 0, changePct: 0 },
    qqq3: snap['QQQ']  ?? { ticker: 'QQQ',  price: 0, change: 0, changePct: 0 },
  };
}

// ── Options chain for a ticker ────────────────────────────────

export interface OptionsContract {
  ticker:          string;
  strike:          number;
  expiry:          string;
  type:            'call' | 'put';
  iv:              number;
  delta:           number;
  gamma:           number;
  open_interest:   number;
  volume:          number;
  last_price:      number;
}

export async function getOptionsChain(ticker: string, expiry?: string): Promise<OptionsContract[]> {
  const params: Record<string, string | number> = {
    underlying_asset: ticker,
    limit: 250,
    order: 'asc',
    sort: 'strike_price',
  };

  if (expiry) params['expiration_date'] = expiry;

  const data = await polygonFetch<any>('/v3/snapshot/options/' + ticker, params);

  return (data.results ?? []).map((r: any) => ({
    ticker:        r.details?.ticker ?? '',
    strike:        r.details?.strike_price ?? 0,
    expiry:        r.details?.expiration_date ?? '',
    type:          r.details?.contract_type ?? 'call',
    iv:            r.greeks?.iv ?? r.implied_volatility ?? 0,
    delta:         r.greeks?.delta ?? 0,
    gamma:         r.greeks?.gamma ?? 0,
    open_interest: r.open_interest ?? 0,
    volume:        r.day?.volume ?? 0,
    last_price:    r.last_quote?.midpoint ?? r.day?.last_price ?? 0,
  }));
}

// ── GEX calculation ───────────────────────────────────────────

export interface GEXLevel {
  strike: number;
  gex:    number; // in dollars
  calls:  number;
  puts:   number;
}

export interface GEXData {
  ticker:     string;
  spotPrice:  number;
  netGamma:   number;
  flipLevel:  number;
  levels:     GEXLevel[];
}

export async function getGEX(ticker: string): Promise<GEXData> {
  const chain = await getOptionsChain(ticker);

  // Current price from snapshot
  const snapData = await polygonFetch<any>(`/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`);
  const spotPrice = snapData.ticker?.day?.c ?? snapData.ticker?.prevDay?.c ?? 0;

  // Group by strike
  const strikeMap = new Map<number, { calls: number; puts: number }>();

  for (const contract of chain) {
    if (!strikeMap.has(contract.strike)) {
      strikeMap.set(contract.strike, { calls: 0, puts: 0 });
    }
    const entry = strikeMap.get(contract.strike)!;

    // GEX = gamma × open_interest × spot^2 × 0.01 × contract_multiplier(100)
    const gexContrib = contract.gamma * contract.open_interest * spotPrice * spotPrice * 0.01 * 100;

    if (contract.type === 'call') {
      entry.calls += gexContrib;
    } else {
      entry.puts -= gexContrib; // puts are negative gamma for dealers
    }
  }

  const levels: GEXLevel[] = [];
  let netGamma = 0;

  for (const [strike, { calls, puts }] of strikeMap) {
    const gex = calls + puts;
    netGamma += gex;
    levels.push({ strike, gex, calls, puts });
  }

  levels.sort((a, b) => a.strike - b.strike);

  // Gamma flip: find strike where cumulative GEX crosses zero
  let cumulative = 0;
  let flipLevel  = spotPrice;

  for (const level of levels) {
    cumulative += level.gex;
    if (cumulative >= 0) {
      flipLevel = level.strike;
      break;
    }
  }

  return {
    ticker,
    spotPrice,
    netGamma,
    flipLevel,
    levels: levels.slice(0, 20), // top 20 strikes around spot
  };
}

// ── Stock quote ───────────────────────────────────────────────

export async function getQuote(ticker: string): Promise<{ price: number; change: number; changePct: number }> {
  const data = await polygonFetch<any>(`/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`);
  const t = data.ticker;
  return {
    price:     t?.day?.c ?? 0,
    change:    t?.todaysChange ?? 0,
    changePct: t?.todaysChangePerc ?? 0,
  };
}

// ── Previous close ────────────────────────────────────────────

export async function getPrevClose(ticker: string): Promise<number> {
  const data = await polygonFetch<any>(`/v2/aggs/ticker/${ticker}/prev`);
  return data.results?.[0]?.c ?? 0;
}
