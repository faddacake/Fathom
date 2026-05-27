import { useState, useEffect, useRef, useCallback } from "react";

// ─── FONTS ────────────────────────────────────────────────────────────────────
const fl = document.createElement("link");
fl.href = "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@300;400;500;600&family=DM+Mono:wght@300;400;500&display=swap";
fl.rel = "stylesheet";
document.head.appendChild(fl);

// ─── FAKE DATA ────────────────────────────────────────────────────────────────
const TICKERS = ["NVDA","SPY","QQQ","TSLA","AAPL","MSFT","META","AMZN","AMD","PLTR","COIN","SMCI"];
const EXPIRIES = ["Jun 6","Jun 13","Jun 20","Jul 18","Aug 15"];
const rnd = (min, max) => Math.random() * (max - min) + min;

let uid = 1;
const makeRow = (isNew = true) => {
  const ticker = TICKERS[Math.floor(Math.random() * TICKERS.length)];
  const type   = Math.random() > 0.52 ? "CALL" : "PUT";
  const strike = (Math.floor(rnd(80, 520) / 5) * 5);
  const prem   = rnd(0.30, 18).toFixed(2);
  const size   = Math.floor(rnd(20, 900));
  const total  = ((prem * size * 100) / 1e6).toFixed(2);
  const sweep  = Math.random() > 0.62;
  return {
    id: uid++,
    ticker, type, strike: `$${strike}`,
    expiry: EXPIRIES[Math.floor(Math.random() * EXPIRIES.length)],
    prem: `$${prem}`, size: size.toLocaleString(),
    total: `$${total}M`, sweep, isNew,
    bull: type === "CALL",
  };
};

const INITIAL_ROWS = Array.from({ length: 9 }, () => makeRow(false));

const TICKER_TAPE = [
  "🚨 $NVDA $4.2M CALL SWEEP · BULLISH",
  "🌊 $SPY DARK POOL 2.4M SHARES",
  "🏛️ Rep. Smith disclosed $MSFT $500K–$1M",
  "⚡ $TSLA 3,200 PUT CONTRACTS · BEARISH",
  "🚨 $QQQ $1.8M CALL BLOCK",
  "🌊 $AAPL DARK POOL 890K SHARES",
  "🏛️ Sen. Jones disclosed $NVDA purchase",
  "⚡ $AMD 5,500 CALL SWEEP · BULLISH",
  "🚨 $META $2.1M PUT BLOCK · BEARISH",
  "🌊 $COIN DARK POOL 340K SHARES",
  "⚡ $PLTR 12,000 CALL CONTRACTS · EXTREME",
];

const TESTIMONIALS = [
  {
    quote: "The dark pool feed alone is worth the subscription. I caught a $40M print on NVDA the day before it popped 12%.",
    name: "Marcus T.", handle: "@marcustrader", role: "Options Trader · 8 yrs",
    avatar: "MT", color: "#00e5b4",
  },
  {
    quote: "Fathom's congress tracker is the first thing I check every morning. Insider buying signals are underrated.",
    name: "Sarah K.", handle: "@sarahkfinance", role: "Retail Investor · 5 yrs",
    avatar: "SK", color: "#f0b429",
  },
  {
    quote: "I built my entire algo on the API. The weekly credit model means I only pay for what I actually use during earnings.",
    name: "Dev R.", handle: "@devanraja", role: "Quant Developer",
    avatar: "DR", color: "#7c6fff",
  },
  {
    quote: "The Discord community is the most signal-to-noise I've found. Mods are actually helpful and the bot alerts are instant.",
    name: "James L.", handle: "@jltrading", role: "Day Trader · 3 yrs",
    avatar: "JL", color: "#ff6b6b",
  },
];

const FEATURES = [
  {
    id: "features",
    icon: "⚡",
    label: "Options Flow",
    title: "Every sweep. Every block. In real time.",
    body: "Track every unusual options transaction as it hits the tape — sweeps, blocks, and large prints filtered by premium, size, sentiment, and sector. The data institutions used to keep to themselves.",
    bullets: ["Live sweep & block detection", "Premium, OI, and volume filters", "Sector & ticker heatmaps", "Historical flow downloads"],
    accent: "#00e5b4",
    preview: "flow",
  },
  {
    id: "dark-pool",
    icon: "🌊",
    label: "Dark Pool",
    title: "Off-exchange prints the public never sees.",
    body: "Dark pool trades represent up to 40% of all US equity volume — and they're almost always institutional. Track block prints, identify accumulation zones, and front-run the news cycle.",
    bullets: ["Real-time off-exchange prints", "Accumulation vs distribution signals", "Ticker-level dark pool history", "Cross-reference with options flow"],
    accent: "#7c6fff",
    preview: "dark",
  },
  {
    id: "congress",
    icon: "🏛️",
    label: "Congress Trades",
    title: "Follow the money inside the Capitol.",
    body: "Members of Congress consistently outperform the market. Every trade disclosure is indexed in real time, cross-referenced with their committee seats and upcoming legislation.",
    bullets: ["All disclosed trades indexed live", "Committee seat cross-reference", "Portfolio tracking by politician", "Historical performance stats"],
    accent: "#f0b429",
    preview: "congress",
  },
];

// ─── COUNTER HOOK ─────────────────────────────────────────────────────────────
function useCounter(target, duration = 1800, start = false) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!start) return;
    let startTime = null;
    const step = (ts) => {
      if (!startTime) startTime = ts;
      const progress = Math.min((ts - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setVal(Math.floor(ease * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration, start]);
  return val;
}

// ─── INTERSECTION HOOK ────────────────────────────────────────────────────────
function useInView(threshold = 0.2) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInView(true); obs.disconnect(); }}, { threshold });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, inView];
}

// ─── MARKET STATUS HOOK ───────────────────────────────────────────────────────
function useMarketStatus() {
  const check = () => {
    const etStr = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
    const et    = new Date(etStr);
    const day   = et.getDay();                          // 0=Sun … 6=Sat
    const mins  = et.getHours() * 60 + et.getMinutes();
    return day >= 1 && day <= 5 && mins >= 570 && mins < 960; // 9:30–16:00 ET
  };
  const [open, setOpen] = useState(check);
  useEffect(() => {
    const id = setInterval(() => setOpen(check()), 30_000);
    return () => clearInterval(id);
  }, []);
  return open;
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const S = `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@300;400;500;600&family=DM+Mono:wght@300;400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{
  --bg:#060810; --s1:#0d1117; --s2:#131920; --s3:#1a2230;
  --teal:#00e5b4; --teal-d:rgba(0,229,180,0.08); --teal-m:rgba(0,229,180,0.18);
  --purple:#7c6fff; --gold:#f0b429; --red:#ff4d6d;
  --border:rgba(0,229,180,0.11); --border2:rgba(255,255,255,0.06);
  --text:#e8edf5; --muted:#5a6a7a; --muted2:#3a4a5a;
  --ff-display:'Bebas Neue',sans-serif;
  --ff-body:'Outfit',sans-serif;
  --ff-mono:'DM Mono',monospace;
  --r:14px;
}
html{scroll-behavior:smooth;}
body{background:var(--bg);color:var(--text);font-family:var(--ff-body);overflow-x:hidden;}
a{text-decoration:none;color:inherit;}
button{font-family:var(--ff-body);}

/* SCROLLBAR */
::-webkit-scrollbar{width:4px;}
::-webkit-scrollbar-track{background:var(--bg);}
::-webkit-scrollbar-thumb{background:var(--teal-m);border-radius:2px;}

/* ── NAV ── */
.nav{
  position:fixed;top:0;left:0;right:0;z-index:100;
  display:flex;align-items:center;justify-content:space-between;
  padding:0 32px;height:64px;
  background:rgba(6,8,16,0.82);
  backdrop-filter:blur(16px);
  border-bottom:1px solid var(--border);
}
.nav-logo{
  display:flex;align-items:center;gap:10px;
  font-family:var(--ff-display);font-size:22px;letter-spacing:0.04em;color:var(--text);
}
.nav-logo-mark{
  width:30px;height:30px;background:var(--teal);border-radius:7px;
  display:flex;align-items:center;justify-content:center;
  font-size:14px;font-weight:700;color:#060810;
}
.nav-links{display:flex;align-items:center;gap:28px;}
.nav-link{font-size:13.5px;color:var(--muted);transition:color .15s;font-weight:500;}
.nav-link:hover{color:var(--text);}
.nav-actions{display:flex;align-items:center;gap:10px;}
.nav-login{font-size:13px;color:var(--muted);padding:8px 16px;border-radius:8px;border:1px solid var(--border);background:transparent;cursor:pointer;transition:all .15s;}
.nav-login:hover{color:var(--text);border-color:rgba(255,255,255,0.2);}
.nav-cta{font-size:13px;font-weight:600;padding:9px 18px;border-radius:8px;background:var(--teal);color:#060810;border:none;cursor:pointer;transition:all .15s;letter-spacing:0.02em;}
.nav-cta:hover{background:#00ffcc;box-shadow:0 4px 16px rgba(0,229,180,0.35);}
.nav-status{display:flex;align-items:center;gap:6px;font-family:var(--ff-mono);font-size:11px;color:var(--muted);padding:5px 10px;background:var(--s1);border:1px solid var(--border);border-radius:6px;}
.nav-status-dot{width:6px;height:6px;border-radius:50%;background:#3ecf4f;box-shadow:0 0 6px #3ecf4f;animation:blink 2s infinite;}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0.4}}

/* ── TICKER TAPE ── */
.ticker-wrap{
  position:fixed;top:64px;left:0;right:0;z-index:99;
  overflow:hidden;height:32px;
  background:rgba(6,8,16,0.9);
  border-bottom:1px solid var(--border);
  backdrop-filter:blur(8px);
}
.ticker-track{
  display:flex;align-items:center;
  height:32px;white-space:nowrap;
  animation:scroll-left 40s linear infinite;
  font-family:var(--ff-mono);font-size:10.5px;color:var(--muted);
  letter-spacing:0.04em;
}
@keyframes scroll-left{from{transform:translateX(0)}to{transform:translateX(-50%)}}
.ticker-item{padding:0 32px;border-right:1px solid var(--border);}
.ticker-item span{color:var(--teal);}

/* ── HERO ── */
.hero{
  min-height:100vh;
  padding:160px 40px 80px;
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:48px;
  align-items:center;
  max-width:1280px;margin:0 auto;
  position:relative;
}
.hero-bg{
  position:fixed;top:0;left:0;right:0;bottom:0;
  background:
    radial-gradient(ellipse 700px 500px at 70% 40%, rgba(0,229,180,0.06) 0%, transparent 70%),
    radial-gradient(ellipse 500px 400px at 10% 80%, rgba(124,111,255,0.05) 0%, transparent 70%);
  pointer-events:none;z-index:0;
}
.hero-grid-bg{
  position:fixed;top:0;left:0;right:0;bottom:0;
  background-image:
    linear-gradient(rgba(0,229,180,0.025) 1px,transparent 1px),
    linear-gradient(90deg,rgba(0,229,180,0.025) 1px,transparent 1px);
  background-size:48px 48px;
  pointer-events:none;z-index:0;
}
.hero-left{position:relative;z-index:10;}
.hero-eyebrow{
  display:inline-flex;align-items:center;gap:8px;
  background:var(--teal-d);border:1px solid var(--border);
  border-radius:999px;padding:5px 14px;
  font-family:var(--ff-mono);font-size:11px;letter-spacing:0.1em;
  text-transform:uppercase;color:var(--teal);margin-bottom:24px;
}
.hero-eyebrow-dot{width:5px;height:5px;background:var(--teal);border-radius:50%;animation:blink 2s infinite;}
.hero-h1{
  font-family:var(--ff-display);
  font-size:clamp(52px,7vw,88px);
  line-height:.95;letter-spacing:.01em;
  color:var(--text);margin-bottom:24px;
}
.hero-h1 .accent{
  color:transparent;
  -webkit-text-stroke:2px var(--teal);
}
.hero-sub{
  font-size:16px;line-height:1.75;color:var(--muted);
  max-width:420px;margin-bottom:36px;font-weight:400;
}
.hero-sub strong{color:var(--text);font-weight:600;}
.hero-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:40px;}
.btn-primary{
  font-size:14px;font-weight:600;letter-spacing:.03em;
  padding:14px 28px;border-radius:10px;
  background:var(--teal);color:#060810;border:none;cursor:pointer;
  transition:all .18s;
}
.btn-primary:hover{background:#00ffcc;box-shadow:0 6px 24px rgba(0,229,180,0.4);transform:translateY(-1px);}
.btn-ghost{
  font-size:14px;font-weight:500;
  padding:14px 24px;border-radius:10px;
  background:transparent;color:var(--text);
  border:1px solid var(--border2);cursor:pointer;
  transition:all .18s;display:flex;align-items:center;gap:8px;
}
.btn-ghost:hover{border-color:var(--teal);color:var(--teal);}
.hero-social-proof{display:flex;align-items:center;gap:16px;}
.avatar-stack{display:flex;}
.avatar-pip{
  width:30px;height:30px;border-radius:50%;
  border:2px solid var(--bg);
  margin-left:-8px;background:var(--s3);
  display:flex;align-items:center;justify-content:center;
  font-size:11px;font-weight:600;color:var(--text);
}
.avatar-pip:first-child{margin-left:0;}
.social-proof-text{font-size:12.5px;color:var(--muted);}
.social-proof-text strong{color:var(--text);}

/* ── LIVE FLOW PANEL ── */
.hero-right{position:relative;z-index:10;}
.flow-panel{
  background:rgba(13,17,23,0.9);
  border:1px solid var(--border);
  border-radius:18px;
  overflow:hidden;
  box-shadow:0 0 0 1px rgba(0,229,180,0.06), 0 32px 80px rgba(0,0,0,0.6),
             inset 0 1px 0 rgba(255,255,255,0.04);
  backdrop-filter:blur(20px);
}
.flow-panel-header{
  display:flex;align-items:center;justify-content:space-between;
  padding:14px 20px;
  background:rgba(19,25,32,0.8);
  border-bottom:1px solid var(--border);
}
.flow-panel-title{
  display:flex;align-items:center;gap:8px;
  font-family:var(--ff-mono);font-size:12px;letter-spacing:.08em;
  text-transform:uppercase;color:var(--text);
}
.live-dot{
  width:7px;height:7px;border-radius:50%;background:var(--teal);
  box-shadow:0 0 8px var(--teal);animation:blink 1.5s infinite;
}
.flow-count{font-family:var(--ff-mono);font-size:11px;color:var(--muted);}
.flow-header-row{
  display:grid;
  grid-template-columns:52px 48px 60px 64px 68px 60px 70px;
  gap:0;padding:8px 16px;
  font-family:var(--ff-mono);font-size:10px;
  letter-spacing:.08em;text-transform:uppercase;color:var(--muted2);
  border-bottom:1px solid rgba(255,255,255,0.04);
}
.flow-body{height:320px;overflow:hidden;position:relative;}
.flow-row{
  display:grid;
  grid-template-columns:52px 48px 60px 64px 68px 60px 70px;
  gap:0;padding:9px 16px;
  font-family:var(--ff-mono);font-size:11.5px;
  border-bottom:1px solid rgba(255,255,255,0.03);
  transition:all .4s ease;
  align-items:center;
}
.flow-row.new-row{
  animation:rowFlash .8s ease forwards;
}
@keyframes rowFlash{
  0%{background:rgba(0,229,180,0.14);transform:translateY(-4px);opacity:0;}
  20%{background:rgba(0,229,180,0.08);transform:translateY(0);opacity:1;}
  100%{background:transparent;}
}
.flow-ticker{font-weight:500;color:var(--text);}
.flow-type-call{color:#00e5b4;font-weight:600;font-size:10.5px;}
.flow-type-put{color:#ff4d6d;font-weight:600;font-size:10.5px;}
.flow-val{color:#8a9ab0;}
.flow-premium{color:var(--text);font-weight:500;}
.flow-total{color:var(--gold);}
.sweep-badge{
  font-size:9px;font-weight:700;letter-spacing:.06em;
  padding:2px 6px;border-radius:4px;
  background:rgba(0,229,180,0.12);color:var(--teal);
  text-transform:uppercase;
}
.flow-panel-footer{
  padding:10px 16px;
  background:rgba(19,25,32,0.6);
  border-top:1px solid var(--border);
  display:flex;align-items:center;justify-content:space-between;
}
.panel-footer-stat{font-family:var(--ff-mono);font-size:10px;color:var(--muted);}
.panel-footer-stat span{color:var(--teal);}
.panel-blur{
  position:absolute;bottom:0;left:0;right:0;height:80px;
  background:linear-gradient(transparent, rgba(13,17,23,0.98));
  pointer-events:none;
}

/* ── STATS BAR ── */
.stats-bar{
  padding:48px 40px;
  border-top:1px solid var(--border);
  border-bottom:1px solid var(--border);
  background:var(--s1);
}
.stats-inner{
  max-width:1100px;margin:0 auto;
  display:grid;grid-template-columns:repeat(4,1fr);gap:24px;
  text-align:center;
}
.stat-item{}
.stat-num{
  font-family:var(--ff-display);
  font-size:clamp(36px,4vw,52px);
  color:var(--text);letter-spacing:.02em;line-height:1;
  margin-bottom:6px;
}
.stat-num em{color:var(--teal);font-style:normal;}
.stat-label{font-size:13px;color:var(--muted);font-weight:400;}

/* ── SECTION ── */
.section{padding:96px 40px;max-width:1280px;margin:0 auto;}
.section-eyebrow{
  font-family:var(--ff-mono);font-size:11px;letter-spacing:.14em;
  text-transform:uppercase;color:var(--teal);margin-bottom:16px;
}
.section-title{
  font-family:var(--ff-display);
  font-size:clamp(36px,4vw,52px);
  line-height:1;letter-spacing:.01em;
  color:var(--text);margin-bottom:16px;
}
.section-sub{font-size:16px;color:var(--muted);line-height:1.7;max-width:560px;margin-bottom:56px;}

/* ── FEATURES ── */
.feature-block{
  display:grid;grid-template-columns:1fr 1fr;
  gap:64px;align-items:center;
  margin-bottom:96px;padding-bottom:96px;
  border-bottom:1px solid var(--border);
}
.feature-block:last-child{border-bottom:none;margin-bottom:0;padding-bottom:0;}
.feature-block.reverse{direction:rtl;}
.feature-block.reverse > *{direction:ltr;}
.feat-label{
  display:inline-flex;align-items:center;gap:8px;
  font-size:12px;font-family:var(--ff-mono);letter-spacing:.1em;
  text-transform:uppercase;margin-bottom:20px;
  padding:4px 12px;border-radius:6px;
  border:1px solid;
}
.feat-title{
  font-family:var(--ff-display);
  font-size:clamp(28px,3vw,42px);
  line-height:1.05;letter-spacing:.01em;
  color:var(--text);margin-bottom:16px;
}
.feat-body{font-size:15px;color:var(--muted);line-height:1.75;margin-bottom:28px;}
.feat-bullets{list-style:none;display:flex;flex-direction:column;gap:10px;margin-bottom:28px;}
.feat-bullet{
  display:flex;align-items:center;gap:10px;
  font-size:13.5px;color:#8a9ab0;
}
.feat-bullet-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;}
.feat-link{
  display:inline-flex;align-items:center;gap:6px;
  font-size:13.5px;font-weight:600;color:var(--teal);
  cursor:pointer;transition:gap .15s;
}
.feat-link:hover{gap:10px;}
.feat-preview{
  background:var(--s1);border:1px solid var(--border);
  border-radius:16px;overflow:hidden;
  box-shadow:0 20px 60px rgba(0,0,0,0.4);
}
.feat-preview-header{
  padding:12px 16px;background:var(--s2);
  border-bottom:1px solid var(--border);
  font-family:var(--ff-mono);font-size:11px;
  display:flex;align-items:center;gap:8px;color:var(--muted);
}
.feat-preview-dot{width:8px;height:8px;border-radius:50%;background:var(--teal);box-shadow:0 0 8px var(--teal);}
.feat-preview-body{padding:16px;}
.feat-row{
  display:flex;justify-content:space-between;align-items:center;
  padding:9px 12px;border-radius:8px;margin-bottom:4px;
  font-family:var(--ff-mono);font-size:12px;
  background:var(--s3);
}
.feat-row-left{display:flex;align-items:center;gap:10px;}
.feat-row-tick{font-weight:600;color:var(--text);}
.feat-row-badge{
  font-size:9.5px;font-weight:700;padding:2px 7px;
  border-radius:4px;text-transform:uppercase;
}
.badge-call{background:rgba(0,229,180,0.12);color:#00e5b4;}
.badge-put{background:rgba(255,77,109,0.12);color:#ff4d6d;}
.badge-dp{background:rgba(124,111,255,0.12);color:#7c6fff;}
.badge-cong{background:rgba(240,180,41,0.12);color:#f0b429;}
.feat-row-right{color:var(--gold);font-weight:500;}

/* ── HOW IT WORKS ── */
.how-section{
  padding:96px 40px;
  background:var(--s1);
  border-top:1px solid var(--border);
  border-bottom:1px solid var(--border);
}
.how-inner{max-width:1100px;margin:0 auto;}
.how-steps{
  display:grid;grid-template-columns:repeat(3,1fr);gap:32px;
  margin-top:56px;
}
.how-step{
  background:var(--bg);border:1px solid var(--border);
  border-radius:var(--r);padding:32px 28px;
  position:relative;
  transition:border-color .2s,transform .2s;
}
.how-step:hover{border-color:rgba(0,229,180,0.3);transform:translateY(-2px);}
.step-num{
  font-family:var(--ff-display);font-size:56px;
  color:rgba(0,229,180,0.08);line-height:1;
  margin-bottom:12px;letter-spacing:.01em;
}
.step-icon{font-size:28px;margin-bottom:12px;}
.step-title{font-size:17px;font-weight:600;color:var(--text);margin-bottom:10px;}
.step-body{font-size:13.5px;color:var(--muted);line-height:1.7;}
.step-connector{
  display:none;
}

/* ── TESTIMONIALS ── */
.testi-section{padding:96px 40px;}
.testi-grid{
  max-width:1100px;margin:48px auto 0;
  display:grid;grid-template-columns:repeat(2,1fr);gap:20px;
}
.testi-card{
  background:var(--s1);border:1px solid var(--border);
  border-radius:var(--r);padding:28px;
  transition:border-color .2s,transform .2s;
}
.testi-card:hover{border-color:rgba(0,229,180,0.25);transform:translateY(-2px);}
.testi-stars{font-size:13px;color:var(--gold);margin-bottom:14px;letter-spacing:2px;}
.testi-quote{
  font-size:14.5px;line-height:1.75;color:#8a9ab0;
  margin-bottom:20px;font-weight:400;
}
.testi-author{display:flex;align-items:center;gap:12px;}
.testi-avatar{
  width:38px;height:38px;border-radius:50%;
  display:flex;align-items:center;justify-content:center;
  font-size:13px;font-weight:700;color:#060810;flex-shrink:0;
}
.testi-name{font-size:14px;font-weight:600;color:var(--text);margin-bottom:2px;}
.testi-role{font-size:12px;color:var(--muted);}
.testi-handle{font-family:var(--ff-mono);font-size:11px;}

/* ── DISCORD CTA ── */
.discord-section{
  padding:80px 40px;
  background:linear-gradient(135deg, rgba(88,101,242,0.08) 0%, transparent 60%),
             var(--s1);
  border-top:1px solid var(--border);
  border-bottom:1px solid var(--border);
}
.discord-inner{
  max-width:900px;margin:0 auto;
  display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:center;
}
.discord-stats{display:flex;flex-direction:column;gap:16px;margin-top:28px;}
.discord-stat{
  display:flex;align-items:center;gap:14px;
  padding:14px 18px;background:var(--bg);
  border:1px solid var(--border);border-radius:10px;
}
.d-stat-icon{font-size:22px;}
.d-stat-num{font-family:var(--ff-display);font-size:24px;color:var(--text);}
.d-stat-label{font-size:12px;color:var(--muted);}
.discord-cta-card{
  background:var(--bg);border:1px solid rgba(88,101,242,0.3);
  border-radius:18px;padding:36px;text-align:center;
}
.discord-logo{font-size:48px;margin-bottom:16px;}
.discord-cta-title{
  font-family:var(--ff-display);font-size:32px;
  color:var(--text);margin-bottom:10px;
}
.discord-cta-sub{font-size:14px;color:var(--muted);line-height:1.65;margin-bottom:24px;}
.btn-discord{
  display:inline-flex;align-items:center;gap:10px;
  font-size:14px;font-weight:600;padding:14px 28px;
  border-radius:10px;background:#5865f2;color:#fff;
  border:none;cursor:pointer;transition:all .18s;width:100%;justify-content:center;
}
.btn-discord:hover{background:#6b79f5;box-shadow:0 4px 20px rgba(88,101,242,0.4);transform:translateY(-1px);}
.discord-member-preview{display:flex;gap:6px;flex-wrap:wrap;margin-top:20px;justify-content:center;}
.d-member{
  font-family:var(--ff-mono);font-size:10px;
  padding:3px 8px;border-radius:4px;
  background:var(--s2);color:var(--muted);
}

/* ── PRICING PREVIEW ── */
.pricing-preview{padding:96px 40px;}
.pricing-preview-inner{max-width:1100px;margin:0 auto;}
.mini-plans{
  display:grid;grid-template-columns:repeat(4,1fr);
  gap:16px;margin-top:48px;margin-bottom:40px;
}
.mini-plan{
  background:var(--s1);border:1px solid var(--border);
  border-radius:var(--r);padding:24px;
  text-align:center;transition:all .2s;
}
.mini-plan:hover{border-color:rgba(0,229,180,0.25);transform:translateY(-2px);}
.mini-plan.hl{
  border-color:var(--teal);
  background:linear-gradient(160deg,rgba(0,229,180,0.06),var(--s1) 60%);
  box-shadow:0 0 0 1px var(--teal),0 12px 40px rgba(0,229,180,0.1);
}
.mini-name{font-family:var(--ff-display);font-size:22px;color:var(--text);margin-bottom:4px;}
.mini-price{
  font-family:var(--ff-display);font-size:38px;color:var(--text);
  line-height:1;margin-bottom:4px;
}
.mini-price em{font-style:normal;color:var(--teal);}
.mini-per{font-family:var(--ff-mono);font-size:11px;color:var(--muted);margin-bottom:16px;}
.mini-feature{font-size:12px;color:var(--muted);margin-bottom:5px;}

/* ── FINAL CTA ── */
.final-cta{
  padding:96px 40px;
  background:radial-gradient(ellipse 800px 400px at 50% 50%, rgba(0,229,180,0.07) 0%, transparent 70%);
  text-align:center;border-top:1px solid var(--border);
}
.final-cta-title{
  font-family:var(--ff-display);
  font-size:clamp(42px,6vw,72px);
  line-height:.95;letter-spacing:.01em;
  color:var(--text);margin-bottom:20px;
}
.final-cta-title em{color:var(--teal);font-style:normal;}
.final-cta-sub{font-size:16px;color:var(--muted);margin-bottom:36px;line-height:1.65;}
.final-cta-actions{display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;}
.final-note{font-family:var(--ff-mono);font-size:11px;color:var(--muted2);margin-top:20px;letter-spacing:.04em;}

/* ── FOOTER ── */
.footer{
  padding:48px 40px 32px;
  background:var(--s1);
  border-top:1px solid var(--border);
}
.footer-top{
  max-width:1100px;margin:0 auto 40px;
  display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:40px;
}
.footer-brand p{font-size:13px;color:var(--muted);line-height:1.7;margin-top:12px;max-width:260px;}
.footer-col-title{font-size:12px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--text);margin-bottom:16px;}
.footer-links{list-style:none;display:flex;flex-direction:column;gap:10px;}
.footer-links li a{font-size:13px;color:var(--muted);transition:color .15s;}
.footer-links li a:hover{color:var(--teal);}
.footer-bottom{
  max-width:1100px;margin:0 auto;
  display:flex;align-items:center;justify-content:space-between;
  padding-top:24px;border-top:1px solid var(--border);
  font-family:var(--ff-mono);font-size:11px;color:var(--muted2);
}
.footer-disclaimer{font-size:10px;color:var(--muted2);max-width:1100px;margin:16px auto 0;line-height:1.6;}

/* ── RESPONSIVE ── */
@media(max-width:900px){
  .hero{grid-template-columns:1fr;padding:140px 24px 60px;}
  .hero-right{display:none;}
  .stats-inner{grid-template-columns:repeat(2,1fr);}
  .feature-block{grid-template-columns:1fr;}
  .feature-block.reverse{direction:ltr;}
  .how-steps{grid-template-columns:1fr;}
  .discord-inner{grid-template-columns:1fr;}
  .mini-plans{grid-template-columns:repeat(2,1fr);}
  .testi-grid{grid-template-columns:1fr;}
  .footer-top{grid-template-columns:1fr 1fr;}
  .nav-links{display:none;}
  .nav-status{display:none;}
}

/* ── REVEAL ANIMATION ── */
.reveal{opacity:0;transform:translateY(24px);transition:opacity .6s ease,transform .6s ease;}
.reveal.in{opacity:1;transform:translateY(0);}
`;

// ─── FLOW ROW COMPONENT ────────────────────────────────────────────────────────
function FlowRow({ row }) {
  return (
    <div className={`flow-row ${row.isNew ? "new-row" : ""}`}>
      <span className="flow-ticker">{row.ticker}</span>
      <span className={row.bull ? "flow-type-call" : "flow-type-put"}>{row.type}</span>
      <span className="flow-val">{row.strike}</span>
      <span className="flow-val">{row.expiry}</span>
      <span className="flow-premium">{row.prem}</span>
      <span className="flow-val">{row.size}</span>
      <span className="flow-total">
        {row.sweep
          ? <span className="sweep-badge">SWEEP</span>
          : row.total
        }
      </span>
    </div>
  );
}

// ─── STAT COUNTER ──────────────────────────────────────────────────────────────
function StatCounter({ value, suffix = "", prefix = "", label, started }) {
  const count = useCounter(value, 2000, started);
  return (
    <div className="stat-item">
      <div className="stat-num">
        {prefix}{count.toLocaleString()}<em>{suffix}</em>
      </div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

// ─── FEATURE PREVIEW ──────────────────────────────────────────────────────────
function FeaturePreview({ type, accent }) {
  if (type === "flow") return (
    <div className="feat-preview">
      <div className="feat-preview-header">
        <div className="feat-preview-dot" style={{background:accent,boxShadow:`0 0 8px ${accent}`}}/>
        Options Flow Feed · Live
      </div>
      <div className="feat-preview-body">
        {[
          { tick:"NVDA", type:"CALL", val:"$165  Jun 20", amt:"$4.2M" },
          { tick:"SPY",  type:"PUT",  val:"$540  Jun 13", amt:"$1.8M" },
          { tick:"TSLA", type:"CALL", val:"$220  Jul 18", amt:"$3.1M" },
          { tick:"META", type:"CALL", val:"$550  Jun 20", amt:"$2.6M" },
          { tick:"AMD",  type:"PUT",  val:"$160  Jun 6",  amt:"$0.9M" },
        ].map((r,i) => (
          <div key={i} className="feat-row">
            <div className="feat-row-left">
              <span className="feat-row-tick">{r.tick}</span>
              <span className={`feat-row-badge ${r.type==="CALL"?"badge-call":"badge-put"}`}>{r.type}</span>
              <span style={{fontFamily:"var(--ff-mono)",fontSize:"11px",color:"#5a6a7a"}}>{r.val}</span>
            </div>
            <span className="feat-row-right">{r.amt}</span>
          </div>
        ))}
      </div>
    </div>
  );

  if (type === "dark") return (
    <div className="feat-preview">
      <div className="feat-preview-header">
        <div className="feat-preview-dot" style={{background:accent,boxShadow:`0 0 8px ${accent}`}}/>
        Dark Pool Prints · Live
      </div>
      <div className="feat-preview-body">
        {[
          { tick:"SPY",  shares:"2.4M", val:"$1.08B", signal:"ACCUM" },
          { tick:"AAPL", shares:"890K", val:"$191M",  signal:"ACCUM" },
          { tick:"QQQ",  shares:"1.1M", val:"$487M",  signal:"DIST"  },
          { tick:"MSFT", shares:"340K", val:"$143M",  signal:"ACCUM" },
          { tick:"NVDA", shares:"210K", val:"$368M",  signal:"ACCUM" },
        ].map((r,i) => (
          <div key={i} className="feat-row">
            <div className="feat-row-left">
              <span className="feat-row-tick">{r.tick}</span>
              <span className={`feat-row-badge badge-dp`}>{r.signal}</span>
              <span style={{fontFamily:"var(--ff-mono)",fontSize:"11px",color:"#5a6a7a"}}>{r.shares} shares</span>
            </div>
            <span className="feat-row-right">{r.val}</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="feat-preview">
      <div className="feat-preview-header">
        <div className="feat-preview-dot" style={{background:accent,boxShadow:`0 0 8px ${accent}`}}/>
        Congressional Trades · Disclosed
      </div>
      <div className="feat-preview-body">
        {[
          { name:"Rep. Smith",   tick:"MSFT", type:"Buy", amt:"$500K–$1M",  date:"May 22" },
          { name:"Sen. Jones",   tick:"NVDA", type:"Buy", amt:"$250K–$500K", date:"May 20" },
          { name:"Rep. Brown",   tick:"SPY",  type:"Sell","amt":"$1M–$5M",   date:"May 19" },
          { name:"Sen. Davis",   tick:"AAPL", type:"Buy", amt:"$100K–$250K", date:"May 17" },
          { name:"Rep. Wilson",  tick:"AMD",  type:"Buy", amt:"$15K–$50K",   date:"May 15" },
        ].map((r,i) => (
          <div key={i} className="feat-row">
            <div className="feat-row-left">
              <span className="feat-row-tick" style={{fontSize:"10.5px"}}>{r.name}</span>
              <span className="feat-row-badge badge-cong">{r.tick}</span>
              <span style={{fontFamily:"var(--ff-mono)",fontSize:"10px",color:r.type==="Buy"?"#00e5b4":"#ff4d6d"}}>{r.type}</span>
            </div>
            <span className="feat-row-right" style={{fontSize:"11px"}}>{r.amt}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
const NAV_LINKS = [
  { label: "Features",  href: "#features"  },
  { label: "Dark Pool", href: "#dark-pool" },
  { label: "Congress",  href: "#congress"  },
  { label: "API",       href: "#api"       },
  { label: "Pricing",   href: "#pricing"   },
  { label: "Discord",   href: "#discord"   },
];

export default function Homepage() {
  const [rows, setRows] = useState(INITIAL_ROWS);
  const [alertCount, setAlertCount] = useState(1247);
  const [statsRef, statsInView] = useInView(0.3);
  const marketOpen = useMarketStatus();

  // live flow feed
  useEffect(() => {
    const id = setInterval(() => {
      const newRow = makeRow(true);
      setRows(prev => {
        const next = [newRow, ...prev.slice(0, 8)];
        return next;
      });
      setAlertCount(c => c + 1);
    }, 2200);
    return () => clearInterval(id);
  }, []);

  // clear isNew flag after animation
  useEffect(() => {
    if (rows.length && rows[0].isNew) {
      const id = setTimeout(() => {
        setRows(prev => prev.map((r,i) => i===0 ? {...r,isNew:false} : r));
      }, 1000);
      return () => clearTimeout(id);
    }
  }, [rows]);

  // reveal on scroll
  useEffect(() => {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => { if(e.isIntersecting) e.target.classList.add("in"); });
    }, {threshold:0.1});
    document.querySelectorAll(".reveal").forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const tapeDuplicated = [...TICKER_TAPE, ...TICKER_TAPE];

  return (
    <>
      <style>{S}</style>

      {/* ── NAV ── */}
      <nav className="nav">
        <div className="nav-logo">
          <div className="nav-logo-mark">F</div>
          FATHOM
        </div>
        <div className="nav-links">
          {NAV_LINKS.map(({ label, href }) => (
            <a key={label} href={href} className="nav-link">{label}</a>
          ))}
        </div>
        <div className="nav-actions">
          <div className="nav-status" style={{ borderColor: marketOpen ? "rgba(62,207,79,0.3)" : "rgba(255,77,109,0.3)" }}>
            <div className="nav-status-dot" style={{ background: marketOpen ? "#3ecf4f" : "#ff4d6d", boxShadow: marketOpen ? "0 0 6px #3ecf4f" : "0 0 6px #ff4d6d" }}/>
            {marketOpen ? "Markets Open" : "Markets Closed"}
          </div>
          <button className="nav-login">Log in</button>
          <button className="nav-cta">Start Free →</button>
        </div>
      </nav>

      {/* ── TICKER TAPE ── */}
      <div className="ticker-wrap">
        <div className="ticker-track">
          {tapeDuplicated.map((item, i) => (
            <div key={i} className="ticker-item">
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── BG ── */}
      <div className="hero-bg"/>
      <div className="hero-grid-bg"/>

      {/* ── HERO ── */}
      <div className="hero">
        <div className="hero-left">
          <div className="hero-eyebrow">
            <div className="hero-eyebrow-dot"/>
            Six fathoms deeper than the market
          </div>

          <h1 className="hero-h1">
            MEASURE<br />
            WHAT<br />
            <span className="accent">OTHERS CAN'T</span>
          </h1>

          <p className="hero-sub">
            Real-time options flow, dark pool prints, and congressional trades.
            The <strong>institutional data stack</strong> they never wanted you to have. Now measured, decoded, and delivered in real time.
          </p>

          <div className="hero-actions">
            <button className="btn-primary" onClick={() => window.location.href="/sign-up"}>Start Free — No Card</button>
            <button className="btn-ghost" onClick={() => window.location.href="/dashboard">
              <span>▶</span> Watch 2-min demo
            </button>
          </div>

          <div className="hero-social-proof">
            <div className="avatar-stack">
              {["47","MR","SK","JL","DR"].map((a,i) => (
                <div key={i} className="avatar-pip"
                  style={{background:["#00e5b4","#7c6fff","#f0b429","#ff6b6b","#3ecf4f"][i]}}>
                  {a}
                </div>
              ))}
            </div>
            <div className="social-proof-text">
              <strong>47,000+ traders</strong> tracking flow right now
            </div>
          </div>
        </div>

        {/* ── LIVE FLOW PANEL ── */}
        <div className="hero-right">
          <div className="flow-panel">
            <div className="flow-panel-header">
              <div className="flow-panel-title">
                <div className="live-dot"/>
                Live Options Flow
              </div>
              <div className="flow-count">{alertCount.toLocaleString()} alerts today</div>
            </div>
            <div className="flow-header-row">
              <span>Ticker</span><span>Type</span><span>Strike</span>
              <span>Expiry</span><span>Prem</span><span>Size</span><span>Total</span>
            </div>
            <div className="flow-body">
              {rows.map(row => <FlowRow key={row.id} row={row}/>)}
              <div className="panel-blur"/>
            </div>
            <div className="flow-panel-footer">
              <span className="panel-footer-stat">Showing <span>top unusual activity</span> only</span>
              <span className="panel-footer-stat">Delay: <span>FREE tier ·  10 min</span></span>
            </div>
          </div>
          <div style={{textAlign:"center",marginTop:"12px",fontFamily:"var(--ff-mono)",fontSize:"11px",color:"var(--muted2)"}}>
            ↑ Real-time for paid plans · 10-min delay shown above
          </div>
        </div>
      </div>

      {/* ── STATS BAR ── */}
      <div className="stats-bar" ref={statsRef}>
        <div className="stats-inner">
          <StatCounter value={47000} suffix="+" label="Active traders" started={statsInView}/>
          <StatCounter value={2100000000} suffix="" prefix="$" label="Options premium tracked today" started={statsInView}/>
          <StatCounter value={1247} suffix="" label="Whale alerts fired today" started={statsInView}/>
          <StatCounter value={99} suffix="%" label="Uptime SLA" started={statsInView}/>
        </div>
      </div>

      {/* ── FEATURES ── */}
      <div id="features" className="section">
        <div className="reveal">
          <div className="section-eyebrow">Core Products</div>
          <h2 className="section-title">THREE INSTRUMENTS.<br/>ONE UNFAIR DEPTH.</h2>
          <p className="section-sub">The data existed. The tools existed. Retail just wasn't allowed to see this deep.</p>
        </div>

        {FEATURES.map((f, i) => (
          <div key={i} id={f.id} className={`feature-block reveal ${i%2===1?"reverse":""}`}>
            <div>
              <div className="feat-label"
                style={{color:f.accent, borderColor:`${f.accent}40`, background:`${f.accent}10`}}>
                {f.icon} {f.label}
              </div>
              <h3 className="feat-title">{f.title}</h3>
              <p className="feat-body">{f.body}</p>
              <ul className="feat-bullets">
                {f.bullets.map((b,j) => (
                  <li key={j} className="feat-bullet">
                    <div className="feat-bullet-dot" style={{background:f.accent}}/>
                    {b}
                  </li>
                ))}
              </ul>
              <div className="feat-link" style={{color:f.accent}}>
                Explore {f.label} →
              </div>
            </div>
            <FeaturePreview type={f.preview} accent={f.accent}/>
          </div>
        ))}
      </div>

      {/* ── HOW IT WORKS ── */}
      <div className="how-section">
        <div className="how-inner">
          <div className="reveal" style={{textAlign:"center"}}>
            <div className="section-eyebrow" style={{textAlign:"center"}}>How It Works</div>
            <h2 className="section-title">DIVE IN. 60 SECONDS FLAT.</h2>
          </div>
          <div className="how-steps">
            {[
              {
                n:"01", icon:"🔑",
                title:"Create your free account",
                body:"Sign up with email or connect your Discord account. No credit card required to start."
              },
              {
                n:"02", icon:"⚙️",
                title:"Configure your alerts",
                body:"Set up your flow filter — choose tickers, premium thresholds, option types, and sectors."
              },
              {
                n:"03", icon:"🚀",
                title:"Trade with the flow",
                body:"Receive real-time alerts on web, mobile, and Discord. The whales can't hide from you anymore."
              },
            ].map((s,i) => (
              <div key={i} className="how-step reveal" style={{transitionDelay:`${i*0.12}s`}}>
                <div className="step-num">{s.n}</div>
                <div className="step-icon">{s.icon}</div>
                <div className="step-title">{s.title}</div>
                <div className="step-body">{s.body}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── TESTIMONIALS ── */}
      <div className="testi-section">
        <div style={{maxWidth:"1100px",margin:"0 auto"}}>
          <div className="reveal">
            <div className="section-eyebrow">Trader Stories</div>
            <h2 className="section-title">WHAT THE COMMUNITY SAYS</h2>
          </div>
          <div className="testi-grid">
            {TESTIMONIALS.map((t,i) => (
              <div key={i} className="testi-card reveal" style={{transitionDelay:`${i*0.1}s`}}>
                <div className="testi-stars">★★★★★</div>
                <p className="testi-quote">"{t.quote}"</p>
                <div className="testi-author">
                  <div className="testi-avatar" style={{background:t.color}}>{t.avatar}</div>
                  <div>
                    <div className="testi-name">{t.name}</div>
                    <div className="testi-role">{t.role}</div>
                    <div className="testi-handle" style={{color:t.color,marginTop:"2px"}}>{t.handle}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── DISCORD CTA ── */}
      <div id="discord" className="discord-section">
        <div className="discord-inner">
          <div className="reveal">
            <div className="section-eyebrow">Community</div>
            <h2 className="section-title">JOIN THE FATHOM COMMUNITY</h2>
            <p style={{fontSize:"15px",color:"var(--muted)",lineHeight:1.7,marginBottom:"8px"}}>
              32,000+ traders in the Fathom Discord. Daily market recaps, whale alerts in real time, and a community that actually shares their plays.
            </p>
            <div className="discord-stats">
              {[
                {icon:"🟢", num:"32,400+", label:"Members online daily"},
                {icon:"⚡", num:"~4 sec",  label:"Average alert delivery time"},
                {icon:"📋", num:"1,200+",  label:"Congress trades tracked"},
              ].map((s,i) => (
                <div key={i} className="discord-stat">
                  <div className="d-stat-icon">{s.icon}</div>
                  <div>
                    <div className="d-stat-num">{s.num}</div>
                    <div className="d-stat-label">{s.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="discord-cta-card reveal">
            <div className="discord-logo">💬</div>
            <div className="discord-cta-title">FREE TO JOIN</div>
            <p className="discord-cta-sub">
              Free members get delayed whale alerts. Pro subscribers unlock real-time channels, GEX levels, and direct analyst access.
            </p>
            <button className="btn-discord" onClick={() => window.open("https://discord.gg/CgYANHDQs","_blank")}>
              <span>💬</span> Join on Discord
            </button>
            <div className="discord-member-preview">
              {["#whale-alerts","#dark-pool","#congress-trades","#flow-feed","#general"].map(c => (
                <span key={c} className="d-member">{c}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── PRICING PREVIEW ── */}
      <div id="pricing" className="pricing-preview">
        <a id="api" style={{display:"block",position:"relative",top:"-80px",visibility:"hidden"}} aria-hidden="true"/>
        <div className="pricing-preview-inner">
          <div className="reveal" style={{textAlign:"center"}}>
            <div className="section-eyebrow">Pricing</div>
            <h2 className="section-title">SIMPLE DEPTH. NO TRICKS.</h2>
            <p style={{fontSize:"15px",color:"var(--muted)",marginBottom:"8px"}}>
              Start free. Upgrade when you're ready to go deeper.
            </p>
          </div>
          <div className="mini-plans reveal">
            {[
              {name:"Free",    price:"$0",   per:"/mo",    features:["Delayed flow","5 alerts/day","Basic screener"]},
              {name:"Starter", price:"$29",  per:"/mo",    features:["Real-time flow","50 alerts/day","Dark pool feed"]},
              {name:"Pro",     price:"$59",  per:"/mo",    features:["Unlimited alerts","GEX data","1yr history"],   hl:true},
              {name:"Whale",   price:"$97",  per:"/mo",    features:["Everything","API access","Analyst support"]},
            ].map((p,i) => (
              <div key={i} className={`mini-plan ${p.hl?"hl":""}`}>
                <div className="mini-name">{p.name}</div>
                <div className="mini-price"><em>{p.price}</em></div>
                <div className="mini-per">{p.per}</div>
                {p.features.map((f,j) => <div key={j} className="mini-feature">✓ {f}</div>)}
              </div>
            ))}
          </div>
          <div style={{textAlign:"center"}}>
            <button className="btn-primary" style={{fontSize:"14px",padding:"14px 36px"}} onClick={() => window.location.href="/pricing"}>
              See Full Pricing + API Plans →
            </button>
          </div>
        </div>
      </div>

      {/* ── FINAL CTA ── */}
      <div className="final-cta">
        <h2 className="final-cta-title">
          STOP TRADING <em>SHALLOW.</em><br/>GO DEEPER TODAY.
        </h2>
        <p className="final-cta-sub">
          Free account. No credit card. Six fathoms of data in 60 seconds.
        </p>
        <div className="final-cta-actions">
          <button className="btn-primary" style={{fontSize:"15px",padding:"15px 36px"}}>
            Create Free Account
          </button>
          <button className="btn-ghost" style={{fontSize:"15px",padding:"15px 28px"}}>
            View Live Demo
          </button>
        </div>
        <p className="final-note">No card required · Cancel anytime · SOC 2 compliant</p>
      </div>

      {/* ── FOOTER ── */}
      <footer className="footer">
        <div className="footer-top">
          <div className="footer-brand">
            <div className="nav-logo" style={{marginBottom:"0"}}>
              <div className="nav-logo-mark">F</div>
              FATHOM
            </div>
            <p>We measure what others can't see. Options flow, dark pool data, and congressional trades — surfaced in real time for independent traders.</p>
          </div>
          {[
            {title:"Product", links:["Options Flow","Dark Pool","Congress Trades","Screeners","Alerts","Mobile App"]},
            {title:"Developers", links:["API Docs","API Pricing","MCP Server","Webhooks","Status Page","Changelog"]},
            {title:"Company", links:["About","Blog","Discord","Twitter / X","Privacy Policy","Terms of Service"]},
          ].map((col,i) => (
            <div key={i}>
              <div className="footer-col-title">{col.title}</div>
              <ul className="footer-links">
                {col.links.map(l => <li key={l}><a href="#">{l}</a></li>)}
              </ul>
            </div>
          ))}
        </div>
        <div className="footer-bottom">
          <span>© 2026 Fathom Inc. All rights reserved.</span>
          <span>Depth that retail can't fathom.</span>
        </div>
        <p className="footer-disclaimer">
          Fathom is not a registered investment advisor. Options trading involves significant risk of loss. All data is provided for informational purposes only and should not be construed as investment advice. Past performance of any signal or indicator is not indicative of future results.
        </p>
      </footer>
    </>
  );
}
