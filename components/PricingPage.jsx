'use client';
import { useState, useEffect, useRef } from "react";

// ─── FONTS ────────────────────────────────────────────────────────────────────
const fontLink = document.createElement("link");
fontLink.href = "https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@300;400;500&display=swap";
fontLink.rel = "stylesheet";
document.head.appendChild(fontLink);

// ─── STYLES ───────────────────────────────────────────────────────────────────
const styles = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #060810;
    --surface: #0d1117;
    --surface2: #131920;
    --border: rgba(0,229,180,0.12);
    --border-hover: rgba(0,229,180,0.35);
    --teal: #00e5b4;
    --teal-dim: rgba(0,229,180,0.08);
    --teal-mid: rgba(0,229,180,0.15);
    --gold: #f0b429;
    --text: #e8edf5;
    --muted: #5a6a7a;
    --muted2: #3a4a5a;
    --font-display: 'Syne', sans-serif;
    --font-mono: 'DM Mono', monospace;
    --radius: 14px;
  }

  body { background: var(--bg); color: var(--text); font-family: var(--font-mono); }

  .pricing-root {
    min-height: 100vh;
    background: var(--bg);
    background-image:
      linear-gradient(rgba(0,229,180,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0,229,180,0.03) 1px, transparent 1px);
    background-size: 40px 40px;
    padding: 0 0 80px;
    position: relative;
    overflow-x: hidden;
  }

  /* glow orbs */
  .orb {
    position: fixed;
    border-radius: 50%;
    pointer-events: none;
    filter: blur(80px);
    opacity: 0.18;
    z-index: 0;
  }
  .orb-1 { width: 500px; height: 500px; background: #00e5b4; top: -100px; right: -150px; }
  .orb-2 { width: 400px; height: 400px; background: #0066ff; bottom: 100px; left: -100px; }

  /* ─── HEADER ─── */
  .header {
    position: relative; z-index: 10;
    text-align: center;
    padding: 64px 24px 48px;
  }
  .brand-chip {
    display: inline-flex; align-items: center; gap: 8px;
    background: var(--teal-dim);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 6px 16px;
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--teal);
    margin-bottom: 24px;
  }
  .brand-chip span { width: 6px; height: 6px; background: var(--teal); border-radius: 50%; animation: pulse 2s infinite; }
  @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.8)} }

  .page-title {
    font-family: var(--font-display);
    font-size: clamp(32px, 6vw, 54px);
    font-weight: 800;
    line-height: 1.05;
    letter-spacing: -0.02em;
    color: var(--text);
    margin-bottom: 16px;
  }
  .page-title em { color: var(--teal); font-style: normal; }
  .page-subtitle {
    font-size: 15px;
    color: var(--muted);
    max-width: 480px;
    margin: 0 auto 40px;
    line-height: 1.7;
  }

  /* ─── PRODUCT TABS ─── */
  .tab-row {
    display: flex; justify-content: center;
    gap: 4px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 4px;
    width: fit-content;
    margin: 0 auto 40px;
  }
  .tab-btn {
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.04em;
    padding: 10px 22px;
    border-radius: 9px;
    border: none;
    cursor: pointer;
    background: transparent;
    color: var(--muted);
    transition: all 0.2s;
    white-space: nowrap;
  }
  .tab-btn:hover { color: var(--text); }
  .tab-btn.active {
    background: var(--teal);
    color: #060810;
    font-weight: 600;
  }

  /* ─── BILLING TOGGLE ─── */
  .billing-toggle {
    display: flex; align-items: center; justify-content: center;
    gap: 12px;
    margin-bottom: 48px;
    font-size: 13px;
    color: var(--muted);
  }
  .toggle-track {
    width: 44px; height: 24px;
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 999px;
    cursor: pointer;
    position: relative;
    transition: background 0.2s;
  }
  .toggle-track.on { background: var(--teal); border-color: var(--teal); }
  .toggle-knob {
    width: 18px; height: 18px;
    background: #fff;
    border-radius: 50%;
    position: absolute;
    top: 2px; left: 2px;
    transition: transform 0.2s;
    box-shadow: 0 1px 4px rgba(0,0,0,0.4);
  }
  .toggle-track.on .toggle-knob { transform: translateX(20px); }
  .annual-badge {
    background: var(--gold);
    color: #000;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    padding: 2px 8px;
    border-radius: 999px;
    text-transform: uppercase;
  }

  /* ─── CARDS GRID ─── */
  .cards-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 16px;
    max-width: 1100px;
    margin: 0 auto;
    padding: 0 24px;
    position: relative; z-index: 10;
  }

  .plan-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 28px 24px;
    display: flex;
    flex-direction: column;
    gap: 0;
    position: relative;
    transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s;
    cursor: default;
  }
  .plan-card:hover {
    border-color: var(--border-hover);
    transform: translateY(-3px);
    box-shadow: 0 12px 40px rgba(0,229,180,0.08);
  }
  .plan-card.highlighted {
    border-color: var(--teal);
    background: linear-gradient(160deg, rgba(0,229,180,0.06) 0%, var(--surface) 60%);
    box-shadow: 0 0 0 1px var(--teal), 0 20px 60px rgba(0,229,180,0.12);
  }

  .card-badge {
    position: absolute;
    top: -12px; left: 50%;
    transform: translateX(-50%);
    background: var(--teal);
    color: #060810;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding: 4px 14px;
    border-radius: 999px;
    white-space: nowrap;
  }
  .card-badge.gold { background: var(--gold); }

  .plan-name {
    font-family: var(--font-display);
    font-size: 18px;
    font-weight: 700;
    color: var(--text);
    margin-bottom: 4px;
    margin-top: 8px;
  }
  .plan-desc {
    font-size: 12px;
    color: var(--muted);
    margin-bottom: 20px;
    line-height: 1.5;
  }

  .price-block {
    display: flex;
    align-items: baseline;
    gap: 4px;
    margin-bottom: 6px;
  }
  .price-currency { font-size: 18px; color: var(--teal); font-weight: 500; }
  .price-amount {
    font-family: var(--font-display);
    font-size: 40px;
    font-weight: 800;
    color: var(--text);
    line-height: 1;
  }
  .price-amount.custom-price { font-size: 26px; }
  .price-period { font-size: 12px; color: var(--muted); margin-left: 2px; }

  .price-sub {
    font-size: 11px;
    color: var(--muted);
    margin-bottom: 24px;
  }
  .price-sub span { color: var(--teal); }

  .divider { height: 1px; background: var(--border); margin: 16px 0 20px; }

  .feature-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 10px;
    flex: 1;
    margin-bottom: 28px;
  }
  .feature-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    font-size: 12.5px;
    color: #8a9ab0;
    line-height: 1.4;
  }
  .feature-icon {
    flex-shrink: 0;
    width: 16px; height: 16px;
    border-radius: 50%;
    background: var(--teal-dim);
    border: 1px solid var(--teal);
    display: flex; align-items: center; justify-content: center;
    margin-top: 1px;
  }
  .feature-icon svg { width: 8px; height: 8px; }
  .feature-item.muted-feature .feature-icon {
    background: var(--surface2);
    border-color: var(--muted2);
  }
  .feature-item.muted-feature { color: var(--muted2); }
  .feature-item.muted-feature .feature-icon svg { opacity: 0.3; }

  .cta-btn {
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.06em;
    padding: 13px 20px;
    border-radius: 9px;
    border: none;
    cursor: pointer;
    transition: all 0.18s;
    width: 100%;
    text-align: center;
    text-transform: uppercase;
  }
  .cta-btn.primary {
    background: var(--teal);
    color: #060810;
  }
  .cta-btn.primary:hover {
    background: #00ffcc;
    box-shadow: 0 4px 20px rgba(0,229,180,0.4);
    transform: translateY(-1px);
  }
  .cta-btn.secondary {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text);
  }
  .cta-btn.secondary:hover {
    border-color: var(--teal);
    color: var(--teal);
  }

  /* ─── API CREDITS CALC ─── */
  .credits-section {
    max-width: 1100px;
    margin: 48px auto 0;
    padding: 0 24px;
    position: relative; z-index: 10;
  }
  .credits-calc {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 32px;
  }
  .credits-calc h3 {
    font-family: var(--font-display);
    font-size: 18px;
    font-weight: 700;
    margin-bottom: 8px;
  }
  .credits-calc p { font-size: 13px; color: var(--muted); margin-bottom: 28px; }

  .endpoint-table {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 0;
    font-size: 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
  }
  .et-header { background: var(--surface2); color: var(--muted); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; padding: 10px 16px; }
  .et-cell { padding: 11px 16px; border-top: 1px solid var(--border); color: #8a9ab0; }
  .et-cell.mono { font-family: var(--font-mono); color: var(--teal); }
  .et-cell.cost { color: var(--text); font-weight: 500; }

  /* ─── DISCORD PREVIEW ─── */
  .discord-preview {
    max-width: 1100px;
    margin: 48px auto 0;
    padding: 0 24px;
    position: relative; z-index: 10;
  }
  .discord-mock {
    background: #1e2124;
    border: 1px solid #2e3338;
    border-radius: var(--radius);
    overflow: hidden;
  }
  .discord-topbar {
    background: #18191c;
    padding: 12px 20px;
    display: flex; align-items: center; gap: 10px;
    border-bottom: 1px solid #2e3338;
    font-size: 13px;
    font-weight: 600;
    color: #dcddde;
  }
  .discord-hashtag { color: #72767d; font-size: 18px; }
  .discord-online { font-size: 11px; color: #72767d; font-weight: 400; margin-left: 4px; }
  .discord-messages { padding: 16px 20px; display: flex; flex-direction: column; gap: 14px; }
  .discord-msg { display: flex; gap: 12px; align-items: flex-start; }
  .discord-avatar {
    width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 14px; font-weight: 700; color: #fff;
  }
  .discord-msg-body { flex: 1; }
  .discord-msg-header { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; }
  .discord-username { font-size: 14px; font-weight: 600; }
  .discord-timestamp { font-size: 11px; color: #72767d; }
  .discord-embed {
    background: #2f3136;
    border-left: 4px solid;
    border-radius: 4px;
    padding: 12px 14px;
    margin-top: 6px;
    font-size: 12px;
  }
  .discord-embed-title { font-weight: 700; font-size: 13px; margin-bottom: 6px; }
  .discord-embed-field { color: #b9bbbe; line-height: 1.6; }
  .discord-embed-field strong { color: #dcddde; }

  /* ─── FAQ / FOOTER ─── */
  .footer-strip {
    max-width: 1100px;
    margin: 64px auto 0;
    padding: 0 24px;
    position: relative; z-index: 10;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 24px;
  }
  .footer-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 24px;
    text-align: center;
  }
  .footer-card-icon { font-size: 28px; margin-bottom: 10px; }
  .footer-card h4 { font-family: var(--font-display); font-size: 15px; font-weight: 700; margin-bottom: 8px; }
  .footer-card p { font-size: 12px; color: var(--muted); line-height: 1.6; }

  /* ─── SECTION LABEL ─── */
  .section-label {
    text-align: center;
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 32px;
    position: relative; z-index: 10;
  }
  .section-label span { color: var(--teal); }

  /* ─── COUNTER ANIMATION ─── */
  @keyframes countUp {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .plan-card { animation: countUp 0.3s ease both; }
  .plan-card:nth-child(1) { animation-delay: 0.05s; }
  .plan-card:nth-child(2) { animation-delay: 0.10s; }
  .plan-card:nth-child(3) { animation-delay: 0.15s; }
  .plan-card:nth-child(4) { animation-delay: 0.20s; }

  @keyframes fadeSlide {
    from { opacity: 0; transform: translateY(16px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .tab-content { animation: fadeSlide 0.25s ease both; }

  /* ─── RESPONSIVE ─── */
  @media (max-width: 640px) {
    .cards-grid { grid-template-columns: 1fr; }
    .tab-btn { padding: 9px 14px; font-size: 12px; }
  }
`;

// ─── DATA ─────────────────────────────────────────────────────────────────────
const platformPlans = [
  {
    name: "Free",
    price: { monthly: 0, annual: 0 },
    description: "Taste institutional data, no card needed",
    features: [
      { text: "Options flow (10-min delay)", active: true },
      { text: "5 alerts per day", active: true },
      { text: "Basic stock screener", active: true },
      { text: "Dark pool feed (delayed)", active: true },
      { text: "Community Discord access", active: true },
      { text: "Mobile app access", active: true },
      { text: "Real-time flow", active: false },
      { text: "GEX data", active: false },
    ],
    cta: "Start Free", highlight: false, badge: null,
  },
  {
    name: "Starter",
    price: { monthly: 29, annual: 24 },
    description: "Real-time data for active traders",
    features: [
      { text: "Real-time options flow", active: true },
      { text: "50 alerts per day", active: true },
      { text: "Full options screener", active: true },
      { text: "Dark pool feed (real-time)", active: true },
      { text: "Congressional trades tracker", active: true },
      { text: "Discord premium channels", active: true },
      { text: "Historical flow (30 days)", active: true },
      { text: "GEX data", active: false },
    ],
    cta: "Get Started", highlight: false, badge: null,
  },
  {
    name: "Pro",
    price: { monthly: 59, annual: 49 },
    description: "Build your own edge with advanced tools",
    features: [
      { text: "Everything in Starter", active: true },
      { text: "Unlimited real-time alerts", active: true },
      { text: "Gamma exposure (GEX) data", active: true },
      { text: "Sector flow heatmaps", active: true },
      { text: "Historical flow (1 year)", active: true },
      { text: "API access (500 calls/day)", active: true },
      { text: "Portfolio tracking", active: true },
      { text: "Priority support", active: true },
    ],
    cta: "Go Pro", highlight: true, badge: "Most Popular",
  },
  {
    name: "Whale",
    price: { monthly: 97, annual: 79 },
    description: "The full institutional stack, no limits",
    features: [
      { text: "Everything in Pro", active: true },
      { text: "Unlimited API access", active: true },
      { text: "Custom alert rules (unlimited)", active: true },
      { text: "Dark pool block prints", active: true },
      { text: "Historical flow (5 years)", active: true },
      { text: "White-glove onboarding", active: true },
      { text: "Dedicated analyst access", active: true },
      { text: "MCP server access", active: true },
    ],
    cta: "Go Whale", highlight: false, badge: null,
  },
];

const apiPlans = [
  {
    name: "Starter",
    credits: "500",
    price: 9,
    per: "/ week",
    costPer: "$0.018 / credit",
    description: "For devs testing integrations",
    features: [
      { text: "500 credits per week", active: true },
      { text: "Options flow endpoint", active: true },
      { text: "Stock screener endpoint", active: true },
      { text: "5 req/sec rate limit", active: true },
      { text: "REST API only", active: true },
      { text: "Dark pool endpoint", active: false },
      { text: "WebSocket feed", active: false },
    ],
    cta: "Buy Credits", highlight: false, badge: null,
  },
  {
    name: "Pro",
    credits: "2,500",
    price: 29,
    per: "/ week",
    costPer: "$0.012 / credit",
    description: "For algo traders & researchers",
    features: [
      { text: "2,500 credits per week", active: true },
      { text: "All endpoints unlocked", active: true },
      { text: "Dark pool data", active: true },
      { text: "Congressional trades", active: true },
      { text: "GEX data", active: true },
      { text: "20 req/sec rate limit", active: true },
      { text: "WebSocket feed", active: false },
    ],
    cta: "Buy Credits", highlight: true, badge: "Best Value",
  },
  {
    name: "Business",
    credits: "10,000",
    price: 79,
    per: "/ week",
    costPer: "$0.008 / credit",
    description: "For fintech products & hedge funds",
    features: [
      { text: "10,000 credits per week", active: true },
      { text: "All endpoints + webhooks", active: true },
      { text: "Real-time WebSocket feed", active: true },
      { text: "Bulk historical downloads", active: true },
      { text: "MCP server access", active: true },
      { text: "100 req/sec rate limit", active: true },
      { text: "99.9% SLA guarantee", active: true },
    ],
    cta: "Buy Credits", highlight: false, badge: null,
  },
  {
    name: "Enterprise",
    credits: "∞",
    price: null,
    per: "custom",
    costPer: "Negotiated pricing",
    description: "Unlimited infra, white-label options",
    features: [
      { text: "Unlimited API credits", active: true },
      { text: "Custom rate limits", active: true },
      { text: "Dedicated infrastructure", active: true },
      { text: "White-label licensing", active: true },
      { text: "Custom data feeds", active: true },
      { text: "24/7 priority support", active: true },
      { text: "Custom SLA", active: true },
    ],
    cta: "Contact Sales", highlight: false, badge: null,
  },
];

const discordPlans = [
  {
    name: "Free Bot",
    price: 0,
    per: "/ month",
    description: "Try the alerts in your own server",
    features: [
      { text: "5 alerts per day", active: true },
      { text: "15-minute delay", active: true },
      { text: "Basic whale alerts", active: true },
      { text: "1 server only", active: true },
      { text: "Real-time delivery", active: false },
      { text: "Custom filters", active: false },
      { text: "Congress alerts", active: false },
    ],
    cta: "Add to Server", highlight: false, badge: null,
  },
  {
    name: "Basic",
    price: 19,
    per: "/ month",
    description: "Real-time alerts, no delays",
    features: [
      { text: "50 alerts per day", active: true },
      { text: "Real-time delivery", active: true },
      { text: "Whale + dark pool alerts", active: true },
      { text: "3 servers", active: true },
      { text: "Basic alert filters", active: true },
      { text: "Custom filter rules", active: false },
      { text: "Congress alerts", active: false },
    ],
    cta: "Subscribe", highlight: false, badge: null,
  },
  {
    name: "Pro Bot",
    price: 49,
    per: "/ month",
    description: "The full alert suite for active servers",
    features: [
      { text: "Unlimited alerts", active: true },
      { text: "Real-time delivery", active: true },
      { text: "All alert types", active: true },
      { text: "10 servers", active: true },
      { text: "Custom filter rules", active: true },
      { text: "Congressional trade alerts", active: true },
      { text: "Scheduled daily digests", active: true },
    ],
    cta: "Subscribe", highlight: true, badge: "Most Popular",
  },
  {
    name: "Server",
    price: 99,
    per: "/ month",
    description: "For owners building paid communities",
    features: [
      { text: "Unlimited alerts", active: true },
      { text: "Unlimited servers", active: true },
      { text: "Custom bot branding", active: true },
      { text: "Webhook integration", active: true },
      { text: "All Pro features included", active: true },
      { text: "Revenue share program", active: true },
      { text: "Dedicated bot instance", active: true },
    ],
    cta: "Subscribe", highlight: false, badge: null,
  },
];

const discordMessages = [
  {
    avatar: "🐋", avatarBg: "#5865f2", username: "FlowBot",
    time: "Today at 9:47 AM", botTag: true,
    embed: {
      color: "#00e5b4",
      title: "🚨 WHALE ALERT — $NVDA",
      fields: "$4.2M Call Sweep · Strike $165 · Exp Jun 20\nSentiment: BULLISH · OI Change: +340%\nPremium per contract: $8.40",
    },
  },
  {
    avatar: "🏛️", avatarBg: "#ed4245", username: "CongressBot",
    time: "Today at 10:12 AM", botTag: true,
    embed: {
      color: "#f0b429",
      title: "📋 CONGRESS TRADE DISCLOSED",
      fields: "Rep. Jane Smith bought $MSFT\nAmount: $500K–$1M · Filed: 05/25/26\nCommittee: Technology + Innovation",
    },
  },
  {
    avatar: "🌊", avatarBg: "#3ba55c", username: "DarkPoolBot",
    time: "Today at 11:31 AM", botTag: true,
    embed: {
      color: "#7289da",
      title: "🌑 DARK POOL PRINT — $SPY",
      fields: "Block trade: 2.4M shares off-exchange\nEstimated value: $1.08B\nSentiment signal: ACCUMULATION",
    },
  },
];

const endpointCosts = [
  { endpoint: "/v1/options/flow", tier: "Basic", credits: "1 credit" },
  { endpoint: "/v1/darkpool/feed", tier: "Standard", credits: "3 credits" },
  { endpoint: "/v1/congress/trades", tier: "Standard", credits: "3 credits" },
  { endpoint: "/v1/screener/options", tier: "Premium", credits: "5 credits" },
  { endpoint: "/v1/gamma/exposure", tier: "Premium", credits: "5 credits" },
  { endpoint: "/v1/screener/stocks", tier: "Premium", credits: "5 credits" },
];

// ─── COMPONENTS ───────────────────────────────────────────────────────────────
const CheckIcon = ({ active }) => (
  <div className="feature-icon">
    <svg viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
      {active
        ? <polyline points="2,5.5 4.2,7.5 8,3" stroke="#00e5b4" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        : <line x1="3" y1="5" x2="7" y2="5" stroke="#3a4a5a" strokeWidth="1.6" strokeLinecap="round"/>
      }
    </svg>
  </div>
);

function PlanCard({ plan, isAnnual, isFree }) {
  const price = isFree ? plan.price
    : isAnnual ? plan.price?.annual : plan.price?.monthly;

  return (
    <div className={`plan-card ${plan.highlight ? "highlighted" : ""}`}>
      {plan.badge && (
        <div className={`card-badge ${plan.badge === "Best Value" ? "gold" : ""}`}>
          {plan.badge}
        </div>
      )}
      <div className="plan-name">{plan.name}</div>
      <div className="plan-desc">{plan.description}</div>

      <div className="price-block">
        {price === null ? (
          <div className="price-amount custom-price">Custom</div>
        ) : (
          <>
            <span className="price-currency">$</span>
            <span className="price-amount">{price}</span>
          </>
        )}
        {plan.per && price !== null && (
          <span className="price-period">{plan.per}</span>
        )}
      </div>

      {plan.credits !== undefined && (
        <div className="price-sub">
          <span style={{color:"#00e5b4"}}>{plan.credits}</span> credits included
          {plan.costPer && ` · ${plan.costPer}`}
        </div>
      )}
      {isAnnual && plan.price?.annual > 0 && (
        <div className="price-sub">
          Billed <span>${plan.price.annual * 12}/year</span> · Save ${(plan.price.monthly - plan.price.annual) * 12}
        </div>
      )}
      {(!plan.credits && price === 0) && (
        <div className="price-sub">Free forever, no card required</div>
      )}
      {(!plan.credits && price > 0 && !isAnnual) && (
        <div className="price-sub" style={{height:"18px"}}></div>
      )}

      <div className="divider" />

      <ul className="feature-list">
        {plan.features.map((f, i) => (
          <li key={i} className={`feature-item ${!f.active ? "muted-feature" : ""}`}>
            <CheckIcon active={f.active} />
            {f.text}
          </li>
        ))}
      </ul>

      <button className={`cta-btn ${plan.highlight ? "primary" : "secondary"}`}>
        {plan.cta}
      </button>
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function PricingPage() {
  const [activeTab, setActiveTab] = useState("platform");
  const [isAnnual, setIsAnnual] = useState(false);
  const [tabKey, setTabKey] = useState(0);

  const switchTab = (tab) => {
    setActiveTab(tab);
    setTabKey(k => k + 1);
  };

  return (
    <>
      <style>{styles}</style>
      <div className="pricing-root">
        <div className="orb orb-1" />
        <div className="orb orb-2" />

        {/* ── HEADER ── */}
        <div className="header">
          <div className="brand-chip">
            <span />
            Fathom Pricing
          </div>
          <h1 className="page-title">
            Choose your<br /><em>data advantage</em>
          </h1>
          <p className="page-subtitle">
            One depth. Three ways in. Platform access, raw API credits, or a Discord alert bot — built to surface what others can't measure.
          </p>

          {/* Tab nav */}
          <div className="tab-row">
            {[
              { id: "platform", label: "🖥  Platform" },
              { id: "api",      label: "⚡  API Credits" },
              { id: "discord",  label: "💬  Discord Bot" },
            ].map(t => (
              <button
                key={t.id}
                className={`tab-btn ${activeTab === t.id ? "active" : ""}`}
                onClick={() => switchTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Billing toggle — only for platform */}
          {activeTab === "platform" && (
            <div className="billing-toggle">
              <span style={!isAnnual ? {color:"#e8edf5"} : {}}>Monthly</span>
              <div
                className={`toggle-track ${isAnnual ? "on" : ""}`}
                onClick={() => setIsAnnual(v => !v)}
              >
                <div className="toggle-knob" />
              </div>
              <span style={isAnnual ? {color:"#e8edf5"} : {}}>Annual</span>
              {isAnnual && <div className="annual-badge">Save ~20%</div>}
            </div>
          )}

          {activeTab === "api" && (
            <div className="section-label">
              Credits reset every <span>Monday at 00:00 UTC</span> — unused credits do not roll over
            </div>
          )}

          {activeTab === "discord" && (
            <div className="section-label">
              Bot connects to your server · <span>Stripe billing</span> · Cancel anytime
            </div>
          )}
        </div>

        {/* ── CARDS ── */}
        <div key={tabKey} className="tab-content">
          {activeTab === "platform" && (
            <div className="cards-grid">
              {platformPlans.map((plan, i) => (
                <PlanCard key={i} plan={plan} isAnnual={isAnnual} isFree={false} />
              ))}
            </div>
          )}

          {activeTab === "api" && (
            <>
              <div className="cards-grid">
                {apiPlans.map((plan, i) => (
                  <PlanCard key={i} plan={plan} isAnnual={false} isFree={true} />
                ))}
              </div>

              {/* Endpoint cost table */}
              <div className="credits-section">
                <div className="credits-calc">
                  <h3>How credits are consumed</h3>
                  <p>Different endpoints cost different credit amounts based on data complexity and compute cost.</p>
                  <div className="endpoint-table">
                    <div className="et-header">Endpoint</div>
                    <div className="et-header">Tier</div>
                    <div className="et-header">Cost</div>
                    {endpointCosts.map((row, i) => (
                      <>
                        <div key={`a${i}`} className="et-cell mono">{row.endpoint}</div>
                        <div key={`b${i}`} className="et-cell">{row.tier}</div>
                        <div key={`c${i}`} className="et-cell cost">{row.credits}</div>
                      </>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === "discord" && (
            <>
              <div className="cards-grid">
                {discordPlans.map((plan, i) => (
                  <PlanCard key={i} plan={plan} isAnnual={false} isFree={true} />
                ))}
              </div>

              {/* Discord mock preview */}
              <div className="discord-preview">
                <div className="section-label" style={{marginTop:0, marginBottom:20}}>
                  Preview — <span>what your server members will see</span>
                </div>
                <div className="discord-mock">
                  <div className="discord-topbar">
                    <span className="discord-hashtag">#</span>
                    whale-alerts
                    <span className="discord-online">● 247 online</span>
                  </div>
                  <div className="discord-messages">
                    {discordMessages.map((msg, i) => (
                      <div key={i} className="discord-msg">
                        <div
                          className="discord-avatar"
                          style={{background: msg.avatarBg, fontSize: 18}}
                        >
                          {msg.avatar}
                        </div>
                        <div className="discord-msg-body">
                          <div className="discord-msg-header">
                            <span className="discord-username" style={{color: msg.avatarBg}}>
                              {msg.username}
                            </span>
                            {msg.botTag && (
                              <span style={{
                                background:"#5865f2", color:"#fff",
                                fontSize:10, padding:"1px 5px",
                                borderRadius:3, fontWeight:600
                              }}>BOT</span>
                            )}
                            <span className="discord-timestamp">{msg.time}</span>
                          </div>
                          <div
                            className="discord-embed"
                            style={{borderLeftColor: msg.embed.color}}
                          >
                            <div
                              className="discord-embed-title"
                              style={{color: msg.embed.color}}
                            >
                              {msg.embed.title}
                            </div>
                            <div className="discord-embed-field">
                              {msg.embed.fields.split("\n").map((line, j) => (
                                <div key={j}>{line}</div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── FOOTER TRUST CARDS ── */}
          <div className="footer-strip">
            {[
              { icon: "🔒", title: "Cancel anytime", body: "No lock-in contracts. Downgrade or cancel in one click from your dashboard." },
              { icon: "⚡", title: "Instant activation", body: "API keys and bot tokens are provisioned immediately after payment." },
              { icon: "🛡️", title: "SOC 2 compliant", body: "Your data and credentials are encrypted at rest and in transit." },
              { icon: "💬", title: "Human support", body: "Real people in Discord and email, not just docs and chatbots." },
            ].map((c, i) => (
              <div key={i} className="footer-card">
                <div className="footer-card-icon">{c.icon}</div>
                <h4>{c.title}</h4>
                <p>{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
