// ─── FATHOM — GLOBAL TYPES ───────────────────────────────────────────────────

// ── Tiers ────────────────────────────────────────────────────────────────────
export type PlatformTier = 'free' | 'starter' | 'pro' | 'whale';
export type ApiTier      = 'api_500' | 'api_2500' | 'api_10000' | 'api_enterprise';
export type BotTier      = 'bot_free' | 'bot_basic' | 'bot_pro' | 'bot_server';

export const PLATFORM_CREDITS: Record<PlatformTier, number> = {
  free:    0,
  starter: 500,
  pro:     500,   // Pro gets API credits via separate product
  whale:   10000,
};

export const API_BUNDLE_CREDITS: Record<ApiTier, number> = {
  api_500:        500,
  api_2500:       2500,
  api_10000:      10000,
  api_enterprise: 0, // custom
};

export const ENDPOINT_COSTS: Record<string, number> = {
  '/v1/options/flow':       1,
  '/v1/options/flow/:ticker': 1,
  '/v1/darkpool/feed':      3,
  '/v1/darkpool/:ticker':   3,
  '/v1/congress/trades':    3,
  '/v1/congress/:politician': 3,
  '/v1/screener/options':   5,
  '/v1/screener/stocks':    5,
  '/v1/gamma/exposure/:ticker': 5,
  '/v1/sentiment/sector':   3,
  '/v1/market/snapshot':    1,
};

// ── User ─────────────────────────────────────────────────────────────────────
export interface FathomUser {
  id:               string;
  clerkId:          string;
  stripeCustomerId: string | null;
  discordId:        string | null;
  email:            string;
  platformTier:     PlatformTier;
  apiTier:          ApiTier | null;
  botTier:          BotTier | null;
  createdAt:        string;
  updatedAt:        string;
}

// ── Options Flow ──────────────────────────────────────────────────────────────
export type OptionType      = 'call' | 'put';
export type FlowSentiment   = 'bullish' | 'bearish' | 'neutral';
export type FlowOrderType   = 'sweep' | 'block' | 'split';

export interface OptionsFlow {
  id:           string;
  ticker:       string;
  optionType:   OptionType;
  strike:       number;
  expiry:       string;           // ISO date
  dte:          number;
  premium:      number;           // per contract
  size:         number;           // contracts
  totalPremium: number;           // premium * size * 100
  orderType:    FlowOrderType;
  sentiment:    FlowSentiment;
  exchange:     string;
  iv:           number;           // implied volatility %
  openInterest: number;
  spotPrice:    number;
  timestamp:    string;           // ISO datetime
  isWhale:      boolean;          // totalPremium > 500_000
}

// ── Dark Pool ─────────────────────────────────────────────────────────────────
export type DarkPoolSignal = 'accumulation' | 'distribution' | 'neutral';

export interface DarkPoolPrint {
  id:         string;
  ticker:     string;
  size:       number;             // shares
  price:      number;
  notional:   number;             // size * price
  exchange:   string;             // off-exchange venue
  signal:     DarkPoolSignal;
  timestamp:  string;
}

// ── Congress Trades ───────────────────────────────────────────────────────────
export type CongressChamber    = 'house' | 'senate';
export type CongressTradeType  = 'purchase' | 'sale' | 'sale_partial' | 'exchange';

export interface CongressTrade {
  id:             string;
  politician:     string;
  chamber:        CongressChamber;
  party:          'R' | 'D' | 'I';
  state:          string;
  ticker:         string;
  tradeType:      CongressTradeType;
  amountMin:      number;
  amountMax:      number;
  tradeDate:      string;
  disclosureDate: string;
  committees:     string[];
  filingUrl:      string;
  timestamp:      string;
}

// ── Alerts ────────────────────────────────────────────────────────────────────
export type AlertType = 'flow' | 'darkpool' | 'congress' | 'price';

export interface AlertRule {
  id:           string;
  userId:       string;
  type:         AlertType;
  ticker:       string | null;    // null = all tickers
  optionType:   OptionType | null;
  premiumMin:   number | null;    // minimum total premium
  sweepOnly:    boolean;
  isActive:     boolean;
  createdAt:    string;
}

export interface AlertLog {
  id:        string;
  userId:    string;
  ruleId:    string;
  payload:   Record<string, unknown>;
  sentAt:    string;
  channel:   'discord' | 'email' | 'webhook';
}

// ── API Usage ─────────────────────────────────────────────────────────────────
export interface ApiUsage {
  userId:       string;
  weekStart:    string;           // Monday ISO date
  creditsUsed:  number;
  creditsTotal: number;
  lastUsedAt:   string;
}

// ── GEX ───────────────────────────────────────────────────────────────────────
export interface GexLevel {
  strike:    number;
  gex:       number;             // gamma exposure in $
  calls:     number;
  puts:      number;
  openInt:   number;
}

export interface GexData {
  ticker:     string;
  spotPrice:  number;
  netGamma:   number;
  flipLevel:  number;
  levels:     GexLevel[];
  updatedAt:  string;
}

// ── API Response wrappers ─────────────────────────────────────────────────────
export interface ApiSuccess<T> {
  data:        T;
  creditsUsed: number;
  creditsLeft: number;
  timestamp:   string;
}

export interface ApiError {
  error:   string;
  code:    string;
  status:  number;
}

// ── Stripe Webhook ────────────────────────────────────────────────────────────
export type StripeWebhookEvent =
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'
  | 'invoice.payment_failed'
  | 'invoice.payment_succeeded'
  | 'customer.subscription.trial_will_end';
