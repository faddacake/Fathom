'use client';
import { useState, useEffect, useRef, useMemo } from "react";

const fl = document.createElement("link");
fl.href = "https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&display=swap";
fl.rel = "stylesheet";
document.head.appendChild(fl);

// ─── CONSTANTS & GENERATORS ──────────────────────────────────────────────────
const TICKERS  = ["NVDA","SPY","QQQ","TSLA","AAPL","MSFT","META","AMZN","AMD","PLTR","COIN","SOFI","GME","SMCI","ARM","MSTR"];
const SECTORS  = ["Tech","Finance","Energy","Health","Consumer","Industrial","Materials","Crypto"];
const SECTOR_C = {Tech:"#00e5b4",Finance:"#7c6fff",Energy:"#f0b429",Health:"#3ecf4f",Consumer:"#ff9f43",Industrial:"#74b9ff",Materials:"#a29bfe",Crypto:"#fd79a8"};
const EXP      = ["Jun 6","Jun 13","Jun 20","Jul 18","Aug 15","Sep 19"];
const rng      = (a,b) => Math.random()*(b-a)+a;
let   uid      = 1;

const makeFlow = (isNew=true) => {
  const ticker  = TICKERS[Math.floor(rng(0,TICKERS.length))];
  const type    = Math.random()>0.51?"CALL":"PUT";
  const strike  = Math.floor(rng(80,600)/5)*5;
  const prem    = rng(0.25,22);
  const size    = Math.floor(rng(8,1800));
  const total   = prem*size*100;
  const sweep   = Math.random()>0.65;
  const block   = !sweep && Math.random()>0.72;
  const dte     = [5,7,14,21,30,45,60,90][Math.floor(rng(0,8))];
  const sector  = SECTORS[Math.floor(rng(0,SECTORS.length))];
  const now     = new Date();
  const timeStr = `${String(9+Math.floor(rng(0,6))).padStart(2,"0")}:${String(Math.floor(rng(0,60))).padStart(2,"0")}`;
  return { id:uid++, ticker, type, strike:`$${strike}`, expiry:EXP[Math.floor(rng(0,EXP.length))],
    prem:prem.toFixed(2), size:size.toLocaleString(), total, totalFmt: total>=1e6?`$${(total/1e6).toFixed(2)}M`:`$${(total/1e3).toFixed(0)}K`,
    sweep, block, dte, sector, isNew, time:timeStr, bull:type==="CALL" };
};

const makeDP = () => {
  const ticker = TICKERS[Math.floor(rng(0,TICKERS.length))];
  const shares = Math.floor(rng(50,3500))*1000;
  const price  = rng(20,600);
  const val    = shares*price;
  const sig    = Math.random()>0.55?"ACCUM":"DIST";
  return { id:uid++, ticker, shares:`${(shares/1e3).toFixed(0)}K`, val: val>=1e9?`$${(val/1e9).toFixed(2)}B`:`$${(val/1e6).toFixed(0)}M`, sig, isNew:true };
};

const INIT_ROWS  = Array.from({length:18},()=>makeFlow(false));
const INIT_DP    = Array.from({length:8}, ()=>{const r=makeDP();r.isNew=false;return r;});
const CONGRESS   = [
  {id:1,name:"Rep. A. Smith",  party:"R",ticker:"MSFT",action:"Buy", amt:"$500K–$1M",  filed:"May 22",committee:"Tech"},
  {id:2,name:"Sen. B. Jones",  party:"D",ticker:"NVDA",action:"Buy", amt:"$250K–$500K",filed:"May 20",committee:"Commerce"},
  {id:3,name:"Rep. C. Brown",  party:"R",ticker:"SPY", action:"Sell","amt":"$1M–$5M",  filed:"May 19",committee:"Finance"},
  {id:4,name:"Sen. D. Davis",  party:"D",ticker:"AAPL",action:"Buy", amt:"$100K–$250K",filed:"May 17",committee:"Tech"},
  {id:5,name:"Rep. E. Wilson", party:"R",ticker:"AMD", action:"Buy", amt:"$15K–$50K",  filed:"May 15",committee:"Defense"},
  {id:6,name:"Sen. F. Miller", party:"D",ticker:"AMZN",action:"Buy", amt:"$500K–$1M",  filed:"May 12",committee:"Commerce"},
  {id:7,name:"Rep. G. Taylor", party:"R",ticker:"COIN",action:"Buy", amt:"$50K–$100K", filed:"May 10",committee:"Finance"},
];

const MARKET_BASE = {SPY:541.23,QQQ:471.84,IWM:207.41,VIX:16.42,DXY:104.12};

const NAV_ITEMS = [
  {id:"flow",    icon:"⚡", label:"Options Flow"},
  {id:"dark",    icon:"🌊", label:"Dark Pool"},
  {id:"congress",icon:"🏛️", label:"Congress"},
  {id:"screener",icon:"🔍", label:"Screener"},
  {id:"alerts",  icon:"🔔", label:"My Alerts"},
  {id:"portfolio",icon:"💼",label:"Portfolio"},
];

// ─── STYLES ──────────────────────────────────────────────────────────────────
const S = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{
  --bg:#060810; --s1:#0b0f18; --s2:#10151f; --s3:#161d28; --s4:#1c2433;
  --teal:#00e5b4; --teal-d:rgba(0,229,180,0.08); --teal-m:rgba(0,229,180,0.16);
  --red:#ff4d6d;  --red-d:rgba(255,77,109,0.08);
  --gold:#f0b429; --purple:#7c6fff; --green:#3ecf4f;
  --border:rgba(255,255,255,0.06); --border-t:rgba(0,229,180,0.12);
  --text:#dde4ef; --muted:#4a5a6e; --muted2:#2e3a4a;
  --ff-data:'DM Mono',monospace;
  --ff-ui:'Syne',sans-serif;
  --r:8px;
}
body{background:var(--bg);color:var(--text);font-family:var(--ff-data);overflow:hidden;font-size:13px;}
::-webkit-scrollbar{width:3px;height:3px;}
::-webkit-scrollbar-track{background:transparent;}
::-webkit-scrollbar-thumb{background:var(--muted2);border-radius:2px;}

/* ── LAYOUT ── */
.db{
  display:grid;
  grid-template-columns:58px 1fr 298px;
  grid-template-rows:32px 50px 1fr;
  height:100vh;
  overflow:hidden;
}

/* ── MARKET STRIP ── */
.mkt-strip{
  grid-column:1/4;grid-row:1;
  background:var(--s1);
  border-bottom:1px solid var(--border);
  display:flex;align-items:center;
  padding:0 12px;
  gap:0;overflow:hidden;
}
.mkt-item{
  display:flex;align-items:center;gap:6px;
  padding:0 14px;
  border-right:1px solid var(--border);
  font-size:11px;height:32px;
  white-space:nowrap;
}
.mkt-sym{color:var(--text);font-weight:500;letter-spacing:.04em;}
.mkt-price{color:var(--text);}
.mkt-chg-up{color:var(--teal);}
.mkt-chg-dn{color:var(--red);}
.mkt-time{margin-left:auto;font-size:10px;color:var(--muted);padding-right:4px;letter-spacing:.04em;}
.live-chip{
  display:flex;align-items:center;gap:5px;
  font-size:10px;color:var(--teal);letter-spacing:.08em;
  padding:3px 8px;background:var(--teal-d);border:1px solid var(--border-t);
  border-radius:4px;margin-right:12px;flex-shrink:0;
}
.live-dot{width:5px;height:5px;background:var(--teal);border-radius:50%;animation:pulse 1.8s infinite;}
@keyframes pulse{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(0,229,180,.4)}50%{opacity:.6;box-shadow:0 0 0 4px rgba(0,229,180,0)}}

/* ── TOPBAR ── */
.topbar{
  grid-column:2/4;grid-row:2;
  background:var(--s1);
  border-bottom:1px solid var(--border);
  display:flex;align-items:center;
  padding:0 18px;gap:12px;
}
.topbar-title{font-family:var(--ff-ui);font-size:15px;font-weight:700;color:var(--text);margin-right:4px;}
.topbar-sub{font-size:11px;color:var(--muted);letter-spacing:.04em;}
.topbar-sep{flex:1;}
.search-box{
  display:flex;align-items:center;gap:8px;
  background:var(--s3);border:1px solid var(--border);
  border-radius:6px;padding:6px 12px;width:180px;
  font-family:var(--ff-data);font-size:12px;color:var(--muted);
  cursor:text;transition:border-color .15s;
}
.search-box:hover{border-color:var(--border-t);}
.topbar-icon-btn{
  width:32px;height:32px;border-radius:6px;background:var(--s3);
  border:1px solid var(--border);display:flex;align-items:center;
  justify-content:center;font-size:14px;cursor:pointer;transition:all .15s;
}
.topbar-icon-btn:hover{border-color:var(--border-t);}
.notif-badge{position:relative;}
.notif-badge::after{
  content:'3';position:absolute;top:-4px;right:-4px;
  width:14px;height:14px;background:var(--red);border-radius:50%;
  font-size:8px;display:flex;align-items:center;justify-content:center;
  font-weight:700;color:#fff;
}
.user-avatar{
  width:32px;height:32px;border-radius:50%;
  background:linear-gradient(135deg,var(--teal),var(--purple));
  display:flex;align-items:center;justify-content:center;
  font-size:12px;font-weight:700;color:#060810;cursor:pointer;flex-shrink:0;
}
.upgrade-chip{
  font-size:11px;font-weight:600;letter-spacing:.04em;
  padding:5px 12px;border-radius:6px;
  background:var(--teal);color:#060810;cursor:pointer;
  transition:all .15s;flex-shrink:0;
}
.upgrade-chip:hover{background:#00ffcc;}

/* ── SIDEBAR ── */
.sidebar{
  grid-column:1;grid-row:2/4;
  background:var(--s1);
  border-right:1px solid var(--border);
  display:flex;flex-direction:column;
  align-items:center;padding:12px 0;gap:2px;
  z-index:20;
}
.sb-logo{
  width:36px;height:36px;background:var(--teal);border-radius:9px;
  display:flex;align-items:center;justify-content:center;
  font-family:var(--ff-ui);font-size:16px;font-weight:800;
  color:#060810;margin-bottom:14px;flex-shrink:0;
}
.sb-btn{
  width:42px;height:42px;border-radius:8px;
  display:flex;align-items:center;justify-content:center;
  font-size:17px;cursor:pointer;transition:all .15s;
  position:relative;border:1px solid transparent;
}
.sb-btn:hover{background:var(--s3);}
.sb-btn.active{background:var(--teal-d);border-color:var(--border-t);}
.sb-btn.active::before{
  content:'';position:absolute;left:-1px;top:25%;bottom:25%;
  width:2px;background:var(--teal);border-radius:2px;
}
.sb-tip{
  position:absolute;left:52px;
  background:var(--s4);border:1px solid var(--border);
  border-radius:6px;padding:5px 10px;
  font-size:11px;color:var(--text);white-space:nowrap;
  opacity:0;pointer-events:none;transition:opacity .15s;z-index:99;
}
.sb-btn:hover .sb-tip{opacity:1;}
.sb-spacer{flex:1;}
.sb-settings{font-size:16px;}

/* ── MAIN PANEL ── */
.main-panel{
  grid-column:2;grid-row:3;
  display:flex;flex-direction:column;
  overflow:hidden;
  background:var(--bg);
}

/* ── STAT CARDS ── */
.stat-cards{
  display:grid;grid-template-columns:repeat(4,1fr);
  gap:1px;background:var(--border);
  border-bottom:1px solid var(--border);
  flex-shrink:0;
}
.stat-card{
  background:var(--s1);padding:12px 16px;
  display:flex;flex-direction:column;gap:3px;
}
.sc-label{font-size:10px;color:var(--muted);letter-spacing:.08em;text-transform:uppercase;}
.sc-val{font-size:20px;font-family:var(--ff-ui);font-weight:700;color:var(--text);line-height:1;}
.sc-val.up{color:var(--teal);}
.sc-val.dn{color:var(--red);}
.sc-val.gold{color:var(--gold);}
.sc-sub{font-size:10px;color:var(--muted);}
.sc-sub span{color:var(--teal);}

/* ── FILTER BAR ── */
.filter-bar{
  display:flex;align-items:center;gap:8px;
  padding:8px 14px;
  background:var(--s1);
  border-bottom:1px solid var(--border);
  flex-shrink:0;overflow-x:auto;
}
.filter-bar::-webkit-scrollbar{height:0;}
.filter-group{display:flex;border:1px solid var(--border);border-radius:6px;overflow:hidden;flex-shrink:0;}
.filter-btn{
  font-family:var(--ff-data);font-size:11px;font-weight:500;
  padding:5px 12px;background:transparent;color:var(--muted);
  border:none;cursor:pointer;transition:all .12s;letter-spacing:.04em;
  white-space:nowrap;
}
.filter-btn:hover{color:var(--text);background:var(--s3);}
.filter-btn.active-call{background:var(--teal-d);color:var(--teal);}
.filter-btn.active-put{background:var(--red-d);color:var(--red);}
.filter-btn.active-all{background:var(--s3);color:var(--text);}
.filter-sep{width:1px;background:var(--border);}
.prem-btn{
  font-family:var(--ff-data);font-size:11px;padding:5px 10px;
  background:transparent;color:var(--muted);border:1px solid var(--border);
  border-radius:6px;cursor:pointer;transition:all .12s;white-space:nowrap;flex-shrink:0;
}
.prem-btn:hover{color:var(--text);border-color:var(--border-t);}
.prem-btn.active{background:var(--teal-d);color:var(--teal);border-color:var(--border-t);}
.sweep-toggle{
  display:flex;align-items:center;gap:6px;
  font-size:11px;color:var(--muted);cursor:pointer;
  padding:5px 10px;border:1px solid var(--border);
  border-radius:6px;transition:all .12s;white-space:nowrap;flex-shrink:0;
}
.sweep-toggle:hover{color:var(--text);}
.sweep-toggle.on{background:rgba(240,180,41,0.08);color:var(--gold);border-color:rgba(240,180,41,0.25);}
.toggle-pip{width:8px;height:8px;border-radius:50%;background:var(--muted2);transition:background .15s;}
.sweep-toggle.on .toggle-pip{background:var(--gold);box-shadow:0 0 6px var(--gold);}
.filter-ticker{
  font-family:var(--ff-data);font-size:11px;
  background:var(--s3);border:1px solid var(--border);
  border-radius:6px;padding:5px 10px;color:var(--text);
  width:90px;outline:none;transition:border-color .15s;
}
.filter-ticker::placeholder{color:var(--muted);}
.filter-ticker:focus{border-color:var(--border-t);}
.filter-count{
  margin-left:auto;font-size:10px;color:var(--muted);
  letter-spacing:.04em;white-space:nowrap;flex-shrink:0;
}
.filter-count span{color:var(--teal);}

/* ── FLOW TABLE ── */
.flow-wrap{flex:1;overflow-y:auto;position:relative;}
.flow-table{width:100%;border-collapse:collapse;}
.ft-head{
  position:sticky;top:0;z-index:10;
  background:var(--s2);
}
.ft-head th{
  padding:7px 10px;text-align:left;
  font-size:10px;color:var(--muted);letter-spacing:.08em;text-transform:uppercase;
  border-bottom:1px solid var(--border);font-weight:400;white-space:nowrap;
}
.ft-head th:first-child{padding-left:16px;}
.ft-row{
  border-bottom:1px solid rgba(255,255,255,0.025);
  cursor:pointer;transition:background .12s;
}
.ft-row:hover{background:var(--s3);}
.ft-row.selected{background:rgba(0,229,180,0.06)!important;}
.ft-row.new-r{animation:rowIn .7s ease forwards;}
@keyframes rowIn{
  0%{background:rgba(0,229,180,0.16);opacity:.6;transform:translateY(-2px);}
  40%{background:rgba(0,229,180,0.07);}
  100%{background:transparent;opacity:1;transform:none;}
}
.ft-row.new-r.put-r{animation:rowInPut .7s ease forwards;}
@keyframes rowInPut{
  0%{background:rgba(255,77,109,0.12);opacity:.6;transform:translateY(-2px);}
  40%{background:rgba(255,77,109,0.05);}
  100%{background:transparent;opacity:1;transform:none;}
}
.ft-row td{padding:7px 10px;white-space:nowrap;font-size:12px;}
.ft-row td:first-child{padding-left:16px;}
.td-time{color:var(--muted);font-size:11px;}
.td-ticker{font-weight:500;color:var(--text);letter-spacing:.03em;}
.td-call{color:var(--teal);font-weight:600;font-size:11px;letter-spacing:.04em;}
.td-put{color:var(--red);font-weight:600;font-size:11px;letter-spacing:.04em;}
.td-strike{color:#8a9ab0;}
.td-exp{color:#8a9ab0;}
.td-prem{color:var(--text);}
.td-size{color:#8a9ab0;}
.td-total{color:var(--gold);font-weight:500;}
.td-dte{color:var(--muted);font-size:11px;}
.tag{
  font-size:9px;font-weight:700;letter-spacing:.06em;
  padding:2px 6px;border-radius:3px;text-transform:uppercase;
}
.tag-sweep{background:rgba(240,180,41,0.12);color:var(--gold);}
.tag-block{background:rgba(124,111,255,0.12);color:var(--purple);}
.tag-sector{background:var(--s4);color:var(--muted);font-weight:400;}

/* ── DETAIL DRAWER ── */
.drawer{
  position:absolute;bottom:0;left:0;right:0;
  height:0;overflow:hidden;
  transition:height .22s ease;
  background:var(--s2);
  border-top:1px solid var(--border-t);
  z-index:30;
}
.drawer.open{height:186px;}
.drawer-inner{padding:16px 20px;display:grid;grid-template-columns:200px 1fr 180px;gap:24px;height:100%;}
.drawer-close{
  position:absolute;top:10px;right:12px;
  width:24px;height:24px;border-radius:4px;
  background:var(--s4);border:1px solid var(--border);
  display:flex;align-items:center;justify-content:center;
  font-size:12px;cursor:pointer;color:var(--muted);
}
.drawer-close:hover{color:var(--text);}
.drawer-title{font-family:var(--ff-ui);font-size:16px;font-weight:700;color:var(--text);margin-bottom:10px;}
.drawer-stat{margin-bottom:8px;}
.drawer-stat-label{font-size:10px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;margin-bottom:2px;}
.drawer-stat-val{font-size:14px;color:var(--text);font-weight:500;}
.drawer-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;}
.drawer-mini{background:var(--s3);border:1px solid var(--border);border-radius:6px;padding:10px 12px;}
.drawer-mini-label{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;}
.drawer-mini-val{font-size:15px;font-weight:600;color:var(--text);}
.drawer-actions{display:flex;flex-direction:column;gap:8px;justify-content:center;}
.da-btn{
  font-family:var(--ff-data);font-size:12px;font-weight:500;
  padding:8px 14px;border-radius:6px;border:1px solid var(--border);
  background:var(--s3);color:var(--text);cursor:pointer;transition:all .14s;
  text-align:center;letter-spacing:.02em;
}
.da-btn:hover{border-color:var(--border-t);color:var(--teal);}
.da-btn.primary{background:var(--teal);color:#060810;border-color:var(--teal);}
.da-btn.primary:hover{background:#00ffcc;}

/* ── RIGHT PANEL ── */
.right-panel{
  grid-column:3;grid-row:3;
  background:var(--s1);
  border-left:1px solid var(--border);
  display:flex;flex-direction:column;
  overflow:hidden;
}
.rp-tabs{
  display:flex;border-bottom:1px solid var(--border);flex-shrink:0;
}
.rp-tab{
  flex:1;padding:10px 6px;text-align:center;
  font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;
  color:var(--muted);cursor:pointer;transition:all .12s;
  border-bottom:2px solid transparent;
}
.rp-tab:hover{color:var(--text);}
.rp-tab.active{color:var(--teal);border-bottom-color:var(--teal);background:var(--teal-d);}
.rp-body{flex:1;overflow-y:auto;padding:10px;}

/* ── WHALE ALERT CARD ── */
.whale-card{
  background:var(--s2);border:1px solid var(--border);
  border-radius:7px;padding:10px 12px;margin-bottom:8px;
  cursor:pointer;transition:border-color .15s;
}
.whale-card:hover{border-color:var(--border-t);}
.whale-card.new-wc{animation:whalePop .6s ease forwards;}
@keyframes whalePop{
  0%{border-color:rgba(0,229,180,.5);background:rgba(0,229,180,.06);}
  100%{border-color:rgba(255,255,255,.06);background:var(--s2);}
}
.wc-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;}
.wc-ticker{font-family:var(--ff-ui);font-size:14px;font-weight:700;color:var(--text);}
.wc-total{font-size:13px;font-weight:600;color:var(--gold);}
.wc-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px;}
.wc-type-call{color:var(--teal);font-size:11px;font-weight:600;}
.wc-type-put{color:var(--red);font-size:11px;font-weight:600;}
.wc-detail{font-size:11px;color:var(--muted);}
.wc-time{font-size:10px;color:var(--muted2);margin-top:4px;}

/* ── DARK POOL CARD ── */
.dp-card{
  background:var(--s2);border:1px solid var(--border);
  border-radius:7px;padding:10px 12px;margin-bottom:8px;
  transition:border-color .15s;
}
.dp-card:hover{border-color:rgba(124,111,255,0.3);}
.dp-card.new-dp{animation:dpPop .6s ease forwards;}
@keyframes dpPop{
  0%{border-color:rgba(124,111,255,.5);background:rgba(124,111,255,.07);}
  100%{border-color:rgba(255,255,255,.06);background:var(--s2);}
}
.dp-top{display:flex;justify-content:space-between;margin-bottom:5px;}
.dp-ticker{font-family:var(--ff-ui);font-size:13px;font-weight:700;}
.dp-val{font-size:13px;color:var(--purple);font-weight:500;}
.dp-sig-accum{font-size:10px;font-weight:700;padding:2px 7px;border-radius:3px;background:rgba(0,229,180,.1);color:var(--teal);}
.dp-sig-dist{font-size:10px;font-weight:700;padding:2px 7px;border-radius:3px;background:rgba(255,77,109,.1);color:var(--red);}
.dp-shares{font-size:11px;color:var(--muted);margin-top:3px;}

/* ── CONGRESS CARD ── */
.cong-card{
  background:var(--s2);border:1px solid var(--border);
  border-radius:7px;padding:10px 12px;margin-bottom:8px;
  transition:border-color .15s;
}
.cong-card:hover{border-color:rgba(240,180,41,0.3);}
.cong-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:5px;}
.cong-name{font-size:12px;font-weight:500;color:var(--text);line-height:1.3;}
.cong-party-r{font-size:10px;font-weight:700;padding:1px 5px;border-radius:3px;background:rgba(255,77,109,.12);color:var(--red);}
.cong-party-d{font-size:10px;font-weight:700;padding:1px 5px;border-radius:3px;background:rgba(116,185,255,.12);color:#74b9ff;}
.cong-row{display:flex;align-items:center;gap:6px;margin-bottom:3px;}
.cong-ticker{font-family:var(--ff-ui);font-size:14px;font-weight:700;color:var(--text);}
.cong-buy{color:var(--teal);font-size:11px;font-weight:600;}
.cong-sell{color:var(--red);font-size:11px;font-weight:600;}
.cong-amt{font-size:12px;color:var(--gold);}
.cong-meta{font-size:10px;color:var(--muted);margin-top:3px;}

/* ── SECTOR HEATMAP ── */
.sector-map{padding:10px;border-bottom:1px solid var(--border);flex-shrink:0;}
.sm-title{font-size:10px;color:var(--muted);letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px;}
.sm-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;}
.sm-cell{
  padding:6px 4px;border-radius:5px;text-align:center;cursor:pointer;
  transition:opacity .15s;border:1px solid rgba(255,255,255,.04);
}
.sm-cell:hover{opacity:.8;}
.sm-cell-name{font-size:9px;color:rgba(255,255,255,.5);margin-bottom:2px;letter-spacing:.04em;}
.sm-cell-bull{font-size:10px;font-weight:600;}

/* ── SCROLL END ── */
.flow-end{padding:20px;text-align:center;font-size:11px;color:var(--muted2);letter-spacing:.06em;}
`;

// ─── SECTOR DATA ─────────────────────────────────────────────────────────────
const SECTOR_DATA = [
  {name:"Tech",   bull:78, color:"#00e5b4"},
  {name:"Finance",bull:52, color:"#7c6fff"},
  {name:"Energy", bull:61, color:"#f0b429"},
  {name:"Health", bull:71, color:"#3ecf4f"},
  {name:"Consumer",bull:44,color:"#ff9f43"},
  {name:"Industrial",bull:58,color:"#74b9ff"},
  {name:"Materials",bull:33,color:"#fd79a8"},
  {name:"Crypto",  bull:84, color:"#00e5b4"},
];

function bullBg(bull, color) {
  if (bull >= 65) return `${color}1a`;
  if (bull <= 40) return `rgba(255,77,109,0.1)`;
  return `rgba(255,255,255,0.04)`;
}

// ─── MARKET STRIP ────────────────────────────────────────────────────────────
function MarketStrip({ prices }) {
  const now = new Date();
  const t = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}:${String(now.getSeconds()).padStart(2,"0")} ET`;
  return (
    <div className="mkt-strip">
      <div className="live-chip"><div className="live-dot"/>LIVE</div>
      {Object.entries(prices).map(([sym, data]) => (
        <div key={sym} className="mkt-item">
          <span className="mkt-sym">{sym}</span>
          <span className="mkt-price">{data.price.toFixed(sym==="VIX"||sym==="DXY"?2:2)}</span>
          <span className={data.chg >= 0 ? "mkt-chg-up" : "mkt-chg-dn"}>
            {data.chg >= 0 ? "▲" : "▼"}{Math.abs(data.chg).toFixed(2)}%
          </span>
        </div>
      ))}
      <div className="mkt-time">{t}</div>
    </div>
  );
}

// ─── FILTER BAR ──────────────────────────────────────────────────────────────
function FilterBar({ filter, setFilter, count, total }) {
  return (
    <div className="filter-bar">
      <div className="filter-group">
        {["ALL","CALL","PUT"].map(t => (
          <button key={t}
            className={`filter-btn ${filter.type===t ? (t==="CALL"?"active-call":t==="PUT"?"active-put":"active-all") : ""}`}
            onClick={() => setFilter(f=>({...f,type:t}))}>
            {t}
          </button>
        ))}
      </div>
      <div className="filter-sep"/>
      {[0,50000,100000,500000,1000000].map(v => (
        <button key={v}
          className={`prem-btn ${filter.premMin===v?"active":""}`}
          onClick={() => setFilter(f=>({...f,premMin:v}))}>
          {v===0?"All Premium":v>=1e6?`$${v/1e6}M+`:`$${v/1e3}K+`}
        </button>
      ))}
      <div className="filter-sep" style={{width:"8px",background:"transparent"}}/>
      <div className={`sweep-toggle ${filter.sweep?"on":""}`}
        onClick={() => setFilter(f=>({...f,sweep:!f.sweep}))}>
        <div className="toggle-pip"/>Sweeps Only
      </div>
      <input className="filter-ticker" placeholder="Ticker…" value={filter.ticker}
        onChange={e=>setFilter(f=>({...f,ticker:e.target.value.toUpperCase()}))}/>
      <div className="filter-count">
        Showing <span>{count.toLocaleString()}</span> of {total.toLocaleString()}
      </div>
    </div>
  );
}

// ─── FLOW TABLE ──────────────────────────────────────────────────────────────
function FlowTable({ rows, selected, onSelect }) {
  const cols = ["Time","Ticker","Type","Strike","Expiry","Prem","Contracts","Total","DTE","Tag"];
  return (
    <table className="flow-table">
      <thead className="ft-head">
        <tr>{cols.map(c=><th key={c}>{c}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.id}
            className={`ft-row ${r.isNew?"new-r":""}${r.isNew&&!r.bull?" put-r":""}${selected?.id===r.id?" selected":""}`}
            onClick={()=>onSelect(selected?.id===r.id?null:r)}>
            <td className="td-time">{r.time}</td>
            <td className="td-ticker">{r.ticker}</td>
            <td className={r.bull?"td-call":"td-put"}>{r.type}</td>
            <td className="td-strike">{r.strike}</td>
            <td className="td-exp">{r.expiry}</td>
            <td className="td-prem">${r.prem}</td>
            <td className="td-size">{r.size}</td>
            <td className="td-total">{r.totalFmt}</td>
            <td className="td-dte">{r.dte}d</td>
            <td>
              {r.sweep && <span className="tag tag-sweep">SWEEP</span>}
              {r.block && <span className="tag tag-block">BLOCK</span>}
              {!r.sweep && !r.block && <span className="tag tag-sector">{r.sector}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── DETAIL DRAWER ───────────────────────────────────────────────────────────
function DetailDrawer({ row, onClose }) {
  if (!row) return <div className="drawer"/>;
  const est = (parseFloat(row.prem) * parseInt(row.size.replace(/,/g,"")) * 100);
  return (
    <div className="drawer open">
      <div className="drawer-close" onClick={onClose}>✕</div>
      <div className="drawer-inner">
        <div>
          <div className="drawer-title">{row.ticker} {row.type}</div>
          <div className="drawer-stat">
            <div className="drawer-stat-label">Strike / Expiry</div>
            <div className="drawer-stat-val">{row.strike} · {row.expiry}</div>
          </div>
          <div className="drawer-stat">
            <div className="drawer-stat-label">Execution Type</div>
            <div className="drawer-stat-val" style={{color:row.sweep?"var(--gold)":"var(--purple)"}}>
              {row.sweep?"SWEEP":"BLOCK TRADE"}
            </div>
          </div>
          <div className="drawer-stat">
            <div className="drawer-stat-label">Sector</div>
            <div className="drawer-stat-val" style={{color:SECTOR_C[row.sector]||"var(--text)"}}>{row.sector}</div>
          </div>
        </div>
        <div>
          <div className="drawer-grid">
            {[
              {l:"Prem / Contract", v:`$${row.prem}`},
              {l:"Contracts", v:row.size},
              {l:"Total Premium", v:row.totalFmt, highlight:true},
              {l:"Days to Expiry", v:`${row.dte}d`},
              {l:"Sentiment", v:row.bull?"BULLISH":"BEARISH", bull:row.bull},
              {l:"Filed At", v:row.time},
            ].map((s,i)=>(
              <div key={i} className="drawer-mini">
                <div className="drawer-mini-label">{s.l}</div>
                <div className="drawer-mini-val"
                  style={{color:s.highlight?"var(--gold)":s.bull===true?"var(--teal)":s.bull===false?"var(--red)":"var(--text)"}}>
                  {s.v}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="drawer-actions">
          <button className="da-btn primary">🔔 Set Alert</button>
          <button className="da-btn">📊 View Chart</button>
          <button className="da-btn">🔍 See Similar Flow</button>
        </div>
      </div>
    </div>
  );
}

// ─── RIGHT PANEL ─────────────────────────────────────────────────────────────
function RightPanel({ whales, dpRows, rightTab, setRightTab }) {
  return (
    <div className="right-panel">
      {/* sector heatmap */}
      <div className="sector-map">
        <div className="sm-title">Sector Flow Sentiment Today</div>
        <div className="sm-grid">
          {SECTOR_DATA.map(s => (
            <div key={s.name} className="sm-cell"
              style={{background:bullBg(s.bull,s.color)}}>
              <div className="sm-cell-name">{s.name}</div>
              <div className="sm-cell-bull"
                style={{color:s.bull>=65?s.color:s.bull<=40?"var(--red)":"var(--muted)"}}>
                {s.bull}%
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* tabs */}
      <div className="rp-tabs">
        {[
          {id:"whales",  label:"🐋 Whales"},
          {id:"darkpool",label:"🌊 Dark Pool"},
          {id:"congress",label:"🏛️ Congress"},
        ].map(t=>(
          <div key={t.id}
            className={`rp-tab ${rightTab===t.id?"active":""}`}
            onClick={()=>setRightTab(t.id)}>
            {t.label}
          </div>
        ))}
      </div>

      <div className="rp-body">
        {rightTab==="whales" && whales.map(w=>(
          <div key={w.id} className={`whale-card ${w.isNew?"new-wc":""}`}>
            <div className="wc-top">
              <span className="wc-ticker">{w.ticker}</span>
              <span className="wc-total">{w.totalFmt}</span>
            </div>
            <div className="wc-row">
              <span className={w.bull?"wc-type-call":"wc-type-put"}>{w.type}</span>
              <span className="wc-detail">{w.strike} · {w.expiry}</span>
              {w.sweep && <span className="tag tag-sweep">SWEEP</span>}
            </div>
            <div className="wc-detail">{w.size} contracts · ${w.prem}/contract</div>
            <div className="wc-time">{w.time} · {w.sector}</div>
          </div>
        ))}

        {rightTab==="darkpool" && dpRows.map(d=>(
          <div key={d.id} className={`dp-card ${d.isNew?"new-dp":""}`}>
            <div className="dp-top">
              <span className="dp-ticker">{d.ticker}</span>
              <span className="dp-val">{d.val}</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:"7px"}}>
              <span className={d.sig==="ACCUM"?"dp-sig-accum":"dp-sig-dist"}>{d.sig}</span>
              <span className="dp-shares">{d.shares} shares off-exchange</span>
            </div>
          </div>
        ))}

        {rightTab==="congress" && CONGRESS.map(c=>(
          <div key={c.id} className="cong-card">
            <div className="cong-top">
              <div className="cong-name">{c.name}</div>
              <span className={c.party==="R"?"cong-party-r":"cong-party-d"}>{c.party}</span>
            </div>
            <div className="cong-row">
              <span className="cong-ticker">{c.ticker}</span>
              <span className={c.action==="Buy"?"cong-buy":"cong-sell"}>{c.action}</span>
              <span className="cong-amt">{c.amt}</span>
            </div>
            <div className="cong-meta">Filed {c.filed} · {c.committee} Committee</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [rows,      setRows]      = useState(INIT_ROWS);
  const [dpRows,    setDpRows]    = useState(INIT_DP);
  const [selected,  setSelected]  = useState(null);
  const [filter,    setFilter]    = useState({type:"ALL",premMin:0,sweep:false,ticker:""});
  const [rightTab,  setRightTab]  = useState("whales");
  const [activeNav, setActiveNav] = useState("flow");
  const [prices,    setPrices]    = useState(
    Object.fromEntries(Object.entries(MARKET_BASE).map(([k,v])=>[k,{price:v,chg:0}]))
  );
  const [clock, setClock] = useState(new Date());
  const [stats,  setStats]  = useState({totalPrem:0, bullPrem:0, bearPrem:0, pc:1.12});

  // clock tick
  useEffect(() => {
    const id = setInterval(()=>setClock(new Date()),1000);
    return ()=>clearInterval(id);
  },[]);

  // market price random walk
  useEffect(() => {
    const id = setInterval(()=>{
      setPrices(prev=>{
        const next={};
        for(const [k,v] of Object.entries(prev)){
          const delta=(Math.random()-.5)*0.08;
          const newPrice=Math.max(0.1,v.price+delta);
          const newChg=v.chg+delta*(k==="VIX"?-0.5:0.3);
          next[k]={price:newPrice,chg:Math.max(-9.9,Math.min(9.9,newChg))};
        }
        return next;
      });
    },3200);
    return ()=>clearInterval(id);
  },[]);

  // flow feed update
  useEffect(() => {
    const id = setInterval(()=>{
      const row=makeFlow(true);
      setRows(prev=>[row,...prev.slice(0,59)]);
      // clear new flag
      setTimeout(()=>{
        setRows(prev=>prev.map((r,i)=>i===0?{...r,isNew:false}:r));
      },800);
      // update stats
      setStats(prev=>{
        const tp=prev.totalPrem+row.total;
        const bp=row.bull?prev.bullPrem+row.total:prev.bullPrem;
        const brp=!row.bull?prev.bearPrem+row.total:prev.bearPrem;
        return {totalPrem:tp,bullPrem:bp,bearPrem:brp,pc:brp>0?(bp/brp).toFixed(2):prev.pc};
      });
    },1600);
    return ()=>clearInterval(id);
  },[]);

  // dark pool update
  useEffect(()=>{
    const id=setInterval(()=>{
      const row=makeDP();
      setDpRows(prev=>[row,...prev.slice(0,14)]);
      setTimeout(()=>{
        setDpRows(prev=>prev.map((r,i)=>i===0?{...r,isNew:false}:r));
      },700);
    },4500);
    return ()=>clearInterval(id);
  },[]);

  const filteredRows = useMemo(()=>{
    return rows.filter(r=>{
      if(filter.type!=="ALL" && r.type!==filter.type) return false;
      if(filter.premMin>0 && r.total<filter.premMin) return false;
      if(filter.sweep && !r.sweep) return false;
      if(filter.ticker && !r.ticker.includes(filter.ticker)) return false;
      return true;
    });
  },[rows,filter]);

  const whaleAlerts = useMemo(()=>
    rows.filter(r=>r.total>=500000).slice(0,20)
  ,[rows]);

  const fmtPrem = v => v>=1e9?`$${(v/1e9).toFixed(2)}B`:v>=1e6?`$${(v/1e6).toFixed(1)}M`:`$${(v/1e3).toFixed(0)}K`;

  return(
    <>
      <style>{S}</style>
      <div className="db">
        {/* market strip */}
        <MarketStrip prices={prices}/>

        {/* sidebar */}
        <div className="sidebar">
          <div className="sb-logo">F</div>
          {NAV_ITEMS.map(item=>(
            <div key={item.id}
              className={`sb-btn ${activeNav===item.id?"active":""}`}
              onClick={()=>setActiveNav(item.id)}>
              {item.icon}
              <div className="sb-tip">{item.label}</div>
            </div>
          ))}
          <div className="sb-spacer"/>
          <div className="sb-btn sb-settings">⚙️<div className="sb-tip">Settings</div></div>
          <div className="user-avatar">JD</div>
        </div>

        {/* topbar */}
        <div className="topbar">
          <div className="topbar-title">Options Flow</div>
          <div className="topbar-sub">
            {clock.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})} · Market Hours
          </div>
          <div className="topbar-sep"/>
          <div className="search-box">🔍 &nbsp;Search ticker, sector…</div>
          <div className="topbar-icon-btn notif-badge">🔔</div>
          <div className="topbar-icon-btn">📥</div>
          <div className="upgrade-chip">🌊 Upgrade — Go Deeper</div>
          <div className="user-avatar">JD</div>
        </div>

        {/* main panel */}
        <div className="main-panel">
          {/* stat cards */}
          <div className="stat-cards">
            <div className="stat-card">
              <div className="sc-label">Total Premium Today</div>
              <div className="sc-val">{fmtPrem(stats.totalPrem+8.4e9)}</div>
              <div className="sc-sub">Across <span>{(rows.length+1200).toLocaleString()}</span> contracts</div>
            </div>
            <div className="stat-card">
              <div className="sc-label">Bullish Flow</div>
              <div className="sc-val up">{fmtPrem(stats.bullPrem+5.1e9)}</div>
              <div className="sc-sub"><span>{Math.round(((stats.bullPrem+5.1e9)/(stats.totalPrem+8.4e9))*100)||61}%</span> of total premium</div>
            </div>
            <div className="stat-card">
              <div className="sc-label">Bearish Flow</div>
              <div className="sc-val dn">{fmtPrem(stats.bearPrem+3.3e9)}</div>
              <div className="sc-sub"><span>{Math.round(((stats.bearPrem+3.3e9)/(stats.totalPrem+8.4e9))*100)||39}%</span> of total premium</div>
            </div>
            <div className="stat-card">
              <div className="sc-label">Put / Call Ratio</div>
              <div className="sc-val gold">{stats.pc}</div>
              <div className="sc-sub">Market sentiment: <span>Moderately bullish</span></div>
            </div>
          </div>

          {/* filter bar */}
          <FilterBar
            filter={filter} setFilter={setFilter}
            count={filteredRows.length} total={rows.length}/>

          {/* flow table + drawer wrapper */}
          <div style={{flex:1,overflow:"hidden",position:"relative",display:"flex",flexDirection:"column"}}>
            <div className="flow-wrap">
              <FlowTable rows={filteredRows} selected={selected} onSelect={setSelected}/>
              <div className="flow-end">· End of visible flow · Scroll up for more ·</div>
            </div>
            <DetailDrawer row={selected} onClose={()=>setSelected(null)}/>
          </div>
        </div>

        {/* right panel */}
        <RightPanel
          whales={whaleAlerts}
          dpRows={dpRows}
          rightTab={rightTab}
          setRightTab={setRightTab}/>
      </div>
    </>
  );
}
