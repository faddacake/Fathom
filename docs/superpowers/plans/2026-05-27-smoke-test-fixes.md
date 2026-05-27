# Smoke Test Fixes — 15 Issues Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 15 smoke-test issues across Homepage.jsx, PricingPage.jsx, and app/layout.tsx — zero broken interactions, every button goes somewhere real.

**Architecture:** All UI components are client-side only (loaded via `dynamic(() => import(...), { ssr: false })`). Homepage.jsx and PricingPage.jsx are large single-file components; a new `components/NavBar.tsx` will be extracted for reuse. Auth uses `@clerk/nextjs` hooks/components already in scope via ClerkProvider in `app/layout.tsx`.

**Tech Stack:** Next.js 14 App Router, TypeScript/JSX, Clerk (`@clerk/nextjs`), Tailwind-adjacent inline CSS (styles live in template literals inside each component), `next/navigation` for `useRouter`.

---

## File Map

| File | Action | Issues Addressed |
|------|--------|-----------------|
| `app/layout.tsx` | Modify | #5, #13 |
| `components/NavBar.tsx` | Create | #1, #2, #6, #9 |
| `components/Homepage.jsx` | Modify | #1, #2, #4, #6, #7, #8, #10, #11, #15 |
| `components/PricingPage.jsx` | Modify | #3, #12, #14 |
| `.env.local` | Modify | #5 (comment) |

---

## Task 1: Startup key check + ClerkProvider appearance (#5, #13)

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Add pk_test_ guard and appearance prop to layout.tsx**

Replace current content with:

```typescript
import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

// Fail fast in production if a development Clerk key is deployed
if (
  process.env.NODE_ENV === 'production' &&
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_test_')
) {
  throw new Error(
    'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is a Clerk development key (starts with pk_test_). ' +
    'Swap in a production key from https://dashboard.clerk.com before deploying.'
  );
}

export const metadata: Metadata = {
  title: "Fathom — We measure what others can't see",
  description: 'Real-time options flow, dark pool intelligence, and congressional trade tracking.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      appearance={{
        elements: {
          modalCloseButton: { display: 'block' },
        },
      }}
    >
      <html lang="en">
        <head>
          <link
            href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@300;400;500;600&family=DM+Mono:wght@300;400;500&family=Syne:wght@400;600;700&display=swap"
            rel="stylesheet"
          />
        </head>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
```

- [ ] **Step 2: Add comment to .env.local**

Add this line above the NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY entry in `.env.local`:
```
# To get production keys: https://dashboard.clerk.com → API Keys → Production
```

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx .env.local
git commit -m "fix: startup guard for Clerk dev keys, ClerkProvider modal close button"
```

---

## Task 2: Create shared NavBar component (#1, #2, #6, #9)

**Files:**
- Create: `components/NavBar.tsx`

This component handles: logo, market status, nav links, Clerk auth buttons (Log in / Start Free → or Dashboard if signed in), mobile hamburger menu.

- [ ] **Step 1: Create components/NavBar.tsx**

```typescript
'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useUser, SignInButton, SignUpButton } from '@clerk/nextjs';

function useMarketStatus() {
  const check = () => {
    const etStr = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    const et = new Date(etStr);
    const day = et.getDay();
    const mins = et.getHours() * 60 + et.getMinutes();
    return day >= 1 && day <= 5 && mins >= 570 && mins < 960;
  };
  const [open, setOpen] = useState(check);
  useEffect(() => {
    const id = setInterval(() => setOpen(check()), 30_000);
    return () => clearInterval(id);
  }, []);
  return open;
}

const NAV_LINKS = [
  { label: 'Features',  href: '/#features'  },
  { label: 'Dark Pool', href: '/#dark-pool' },
  { label: 'Congress',  href: '/#congress'  },
  { label: 'API',       href: '/pricing#api' },
  { label: 'Pricing',   href: '/pricing'     },
  { label: 'Discord',   href: '/#discord'   },
];

const NAV_CSS = `
.nav{
  position:fixed;top:0;left:0;right:0;z-index:100;
  display:flex;align-items:center;justify-content:space-between;
  padding:0 32px;height:64px;
  background:rgba(6,8,16,0.82);
  backdrop-filter:blur(16px);
  border-bottom:1px solid rgba(0,229,180,0.11);
}
.nav-logo{
  display:flex;align-items:center;gap:10px;
  font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:0.04em;color:#e8edf5;
  text-decoration:none;
}
.nav-logo-mark{
  width:30px;height:30px;background:#00e5b4;border-radius:7px;
  display:flex;align-items:center;justify-content:center;
  font-size:14px;font-weight:700;color:#060810;
}
.nav-links{display:flex;align-items:center;gap:28px;}
.nav-link{font-size:13.5px;color:#5a6a7a;transition:color .15s;font-weight:500;text-decoration:none;}
.nav-link:hover{color:#e8edf5;}
.nav-actions{display:flex;align-items:center;gap:10px;}
.nav-login{font-size:13px;color:#5a6a7a;padding:8px 16px;border-radius:8px;border:1px solid rgba(0,229,180,0.11);background:transparent;cursor:pointer;transition:all .15s;font-family:'Outfit',sans-serif;}
.nav-login:hover{color:#e8edf5;border-color:rgba(255,255,255,0.2);}
.nav-cta{font-size:13px;font-weight:600;padding:9px 18px;border-radius:8px;background:#00e5b4;color:#060810;border:none;cursor:pointer;transition:all .15s;letter-spacing:0.02em;font-family:'Outfit',sans-serif;}
.nav-cta:hover{background:#00ffcc;box-shadow:0 4px 16px rgba(0,229,180,0.35);}
.nav-dashboard{font-size:13px;font-weight:600;padding:9px 18px;border-radius:8px;background:#00e5b4;color:#060810;border:none;cursor:pointer;transition:all .15s;text-decoration:none;display:inline-block;letter-spacing:0.02em;}
.nav-dashboard:hover{background:#00ffcc;}
.nav-status{display:flex;align-items:center;gap:6px;font-family:'DM Mono',monospace;font-size:11px;color:#5a6a7a;padding:5px 10px;background:#0d1117;border:1px solid rgba(0,229,180,0.11);border-radius:6px;}
.nav-status-dot{width:6px;height:6px;border-radius:50%;}
@keyframes nav-blink{0%,100%{opacity:1}50%{opacity:0.4}}
.nav-hamburger{
  display:none;background:transparent;border:none;cursor:pointer;
  padding:8px;color:#e8edf5;font-size:20px;line-height:1;
}
.mobile-drawer{
  position:fixed;top:64px;left:0;right:0;z-index:99;
  background:#060810;border-bottom:1px solid rgba(0,229,180,0.11);
  padding:16px 24px 24px;
  display:flex;flex-direction:column;gap:4px;
}
.mobile-nav-link{
  display:block;padding:12px 8px;font-size:15px;color:#5a6a7a;
  border-radius:8px;transition:all .15s;text-decoration:none;
}
.mobile-nav-link:hover{color:#e8edf5;background:rgba(255,255,255,0.04);}
.mobile-auth-row{display:flex;gap:10px;margin-top:12px;padding-top:12px;border-top:1px solid rgba(0,229,180,0.11);}
.mobile-auth-row .nav-login,.mobile-auth-row .nav-cta{flex:1;text-align:center;}
@media(max-width:900px){
  .nav{padding:0 20px;}
  .nav-links{display:none;}
  .nav-status{display:none;}
  .nav-hamburger{display:block;}
}
`;

export default function NavBar() {
  const marketOpen = useMarketStatus();
  const { isSignedIn } = useUser();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileNavOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (mobileNavOpen && drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setMobileNavOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [mobileNavOpen]);

  return (
    <>
      <style>{NAV_CSS}</style>
      <nav className="nav">
        <Link href="/" className="nav-logo">
          <div className="nav-logo-mark">F</div>
          FATHOM
        </Link>

        <div className="nav-links">
          {NAV_LINKS.map(({ label, href }) => (
            <a key={label} href={href} className="nav-link">{label}</a>
          ))}
        </div>

        <div className="nav-actions">
          <div
            className="nav-status"
            style={{ borderColor: marketOpen ? 'rgba(62,207,79,0.3)' : 'rgba(255,77,109,0.3)' }}
          >
            <div
              className="nav-status-dot"
              style={{
                background: marketOpen ? '#3ecf4f' : '#ff4d6d',
                boxShadow: marketOpen ? '0 0 6px #3ecf4f' : '0 0 6px #ff4d6d',
                animation: 'nav-blink 2s infinite',
              }}
            />
            {marketOpen ? 'Markets Open' : 'Markets Closed'}
          </div>

          {isSignedIn ? (
            <Link href="/dashboard" className="nav-dashboard">Dashboard →</Link>
          ) : (
            <>
              <SignInButton mode="modal">
                <button className="nav-login">Log in</button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="nav-cta">Start Free →</button>
              </SignUpButton>
            </>
          )}

          <button
            className="nav-hamburger"
            onClick={() => setMobileNavOpen(v => !v)}
            aria-label="Toggle navigation"
          >
            {mobileNavOpen ? '✕' : '☰'}
          </button>
        </div>
      </nav>

      {mobileNavOpen && (
        <div className="mobile-drawer" ref={drawerRef}>
          {NAV_LINKS.map(({ label, href }) => (
            <a
              key={label}
              href={href}
              className="mobile-nav-link"
              onClick={() => setMobileNavOpen(false)}
            >
              {label}
            </a>
          ))}
          <div className="mobile-auth-row">
            {isSignedIn ? (
              <Link href="/dashboard" className="nav-dashboard" style={{flex:1, textAlign:'center'}} onClick={() => setMobileNavOpen(false)}>
                Dashboard →
              </Link>
            ) : (
              <>
                <SignInButton mode="modal">
                  <button className="nav-login" onClick={() => setMobileNavOpen(false)}>Log in</button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <button className="nav-cta" onClick={() => setMobileNavOpen(false)}>Start Free →</button>
                </SignUpButton>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/NavBar.tsx
git commit -m "feat: shared NavBar with Clerk auth, mobile hamburger menu"
```

---

## Task 3: Update Homepage.jsx (#1, #2, #4, #6, #7, #8, #10, #11, #15)

**Files:**
- Modify: `components/Homepage.jsx`

**Summary of changes:**
1. Add `'use client'` directive at top
2. Remove `useMarketStatus` hook (now in NavBar)
3. Import and render `NavBar` component instead of inline nav
4. Remove inline nav CSS and `NAV_LINKS` constant
5. Add `demoOpen` state
6. Wire "Watch 2-min demo" button → `setDemoOpen(true)`
7. Add `VideoModal` component + modal CSS
8. Fix hero-right mobile CSS (`display:none` → `display:block` at 900px)
9. Import `SignUpButton` from `@clerk/nextjs`
10. Wire "Create Free Account" and "View Live Demo" in final-cta section
11. Fix all footer link `href="#"` → real destinations
12. Fix `feat-link` → `<a>` tags with real hrefs
13. Fix `NAV_LINKS` constant: API → `/pricing#api` (NAV_LINKS moves to NavBar, so this step merges with step 3)

- [ ] **Step 1: Add 'use client' and update imports**

Change the first line of `components/Homepage.jsx` from:
```jsx
import { useState, useEffect, useRef, useCallback } from "react";
```
to:
```jsx
'use client';
import { useState, useEffect, useRef, useCallback } from "react";
import { SignUpButton } from "@clerk/nextjs";
import NavBar from "./NavBar";
```

- [ ] **Step 2: Remove useMarketStatus hook and NAV_LINKS constant**

Delete lines 136–150 (`useMarketStatus` function) and lines 796–803 (`NAV_LINKS` constant) from Homepage.jsx.

Also remove `marketOpen` from the state declaration in the main component:
```jsx
// Remove this line from the Homepage component body:
const marketOpen = useMarketStatus();
```

- [ ] **Step 3: Replace inline nav JSX with NavBar component**

Replace the entire `{/* ── NAV ── */}` block (the `<nav className="nav">` element, approximately lines 849–868) with:
```jsx
{/* ── NAV ── */}
<NavBar />
```

- [ ] **Step 4: Add demoOpen state and wire demo button**

In the Homepage component body, after existing state declarations, add:
```jsx
const [demoOpen, setDemoOpen] = useState(false);
```

Change the "Watch 2-min demo" button (currently `onClick={() => window.location.href="/dashboard"}`):
```jsx
<button className="btn-ghost" onClick={() => setDemoOpen(true)}>
  <span>▶</span> Watch 2-min demo
</button>
```

- [ ] **Step 5: Add VideoModal component and CSS**

Add this component definition before the `Homepage` export:
```jsx
function VideoModal({ onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      style={{
        position:"fixed",inset:0,zIndex:9999,
        background:"rgba(0,0,0,0.85)",
        display:"flex",alignItems:"center",justifyContent:"center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          position:"relative",width:"min(860px,92vw)",
          aspectRatio:"16/9",background:"#000",borderRadius:"12px",overflow:"hidden",
        }}
        onClick={e => e.stopPropagation()}
      >
        <iframe
          src="https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1"
          title="Fathom Demo"
          allow="autoplay; fullscreen"
          style={{width:"100%",height:"100%",border:"none"}}
        />
        <button
          onClick={onClose}
          style={{
            position:"absolute",top:"12px",right:"12px",
            background:"rgba(0,0,0,0.7)",color:"#fff",
            border:"none",borderRadius:"50%",
            width:"32px",height:"32px",
            fontSize:"18px",cursor:"pointer",lineHeight:"1",
          }}
          aria-label="Close demo"
        >
          ×
        </button>
      </div>
    </div>
  );
}
```

In the Homepage JSX return, add the modal just before the closing `</>`:
```jsx
{demoOpen && <VideoModal onClose={() => setDemoOpen(false)} />}
```

- [ ] **Step 6: Fix hero-right mobile CSS**

In the `S` styles string, inside the `@media(max-width:900px)` block, change:
```css
.hero-right{display:none;}
```
to:
```css
.hero-right{margin-top:0;}
```

Also update `.hero` mobile rule to stack columns:
Keep the existing `.hero{grid-template-columns:1fr;...}` but ensure hero-left still has `width:100%` (it will via the single-column grid).

- [ ] **Step 7: Wire final-cta buttons**

Replace the two dead buttons in the `{/* ── FINAL CTA ── */}` section:

```jsx
<div className="final-cta-actions">
  <SignUpButton mode="modal">
    <button className="btn-primary" style={{fontSize:"15px",padding:"15px 36px"}}>
      Create Free Account
    </button>
  </SignUpButton>
  <button className="btn-ghost" style={{fontSize:"15px",padding:"15px 28px"}} onClick={() => setDemoOpen(true)}>
    View Live Demo
  </button>
</div>
```

- [ ] **Step 8: Fix footer links**

Replace the footer columns data structure. Change:
```jsx
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
```

to:
```jsx
{[
  {title:"Product", links:[
    {label:"Options Flow",     href:"/#features"},
    {label:"Dark Pool",        href:"/#dark-pool"},
    {label:"Congress Trades",  href:"/#congress"},
    {label:"Screeners",        href:"/dashboard"},
    {label:"Alerts",           href:"/dashboard"},
    {label:"Mobile App",       href:"/#coming-soon"},
  ]},
  {title:"Developers", links:[
    {label:"API Docs",    href:"/pricing#api"},
    {label:"API Pricing", href:"/pricing#api"},
    {label:"MCP Server",  href:"/pricing#api"},
    {label:"Webhooks",    href:"/pricing#api"},
    {label:"Status Page", href:"https://status.fathomtrade.com", external:true},
    {label:"Changelog",   href:"/changelog"},
  ]},
  {title:"Company", links:[
    {label:"About",            href:"/about"},
    {label:"Blog",             href:"/blog"},
    {label:"Discord",          href:"https://discord.gg/CgYANHDQs", external:true},
    {label:"Twitter / X",      href:"https://twitter.com/fathomtrade", external:true},
    {label:"Privacy Policy",   href:"/legal/privacy"},
    {label:"Terms of Service", href:"/legal/terms"},
  ]},
].map((col,i) => (
  <div key={i}>
    <div className="footer-col-title">{col.title}</div>
    <ul className="footer-links">
      {col.links.map(l => (
        <li key={l.label}>
          <a
            href={l.href}
            {...(l.external ? {target:"_blank", rel:"noopener noreferrer"} : {})}
          >
            {l.label}
          </a>
        </li>
      ))}
    </ul>
  </div>
))}
```

- [ ] **Step 9: Fix Explore feature links (#15)**

In the `FEATURES.map` block, change:
```jsx
<div className="feat-link" style={{color:f.accent}}>
  Explore {f.label} →
</div>
```
to:
```jsx
<a
  href={f.id === "features" ? "/#features" : f.id === "dark-pool" ? "/#dark-pool" : "/#congress"}
  className="feat-link"
  style={{color:f.accent}}
>
  Explore {f.label} →
</a>
```

Or, cleaner — add an `exploreHref` field to the `FEATURES` array:
```jsx
const FEATURES = [
  { id:"features",  exploreHref:"/#features",  ... },
  { id:"dark-pool", exploreHref:"/#dark-pool", ... },
  { id:"congress",  exploreHref:"/#congress",  ... },
];
```
Then use `<a href={f.exploreHref} className="feat-link" ...>`.

- [ ] **Step 10: Remove stale nav CSS from S string**

Remove the `/* ── NAV ── */` block from the `S` CSS string (the `.nav`, `.nav-logo`, `.nav-logo-mark`, `.nav-links`, `.nav-link`, `.nav-actions`, `.nav-login`, `.nav-cta`, `.nav-status`, `.nav-status-dot` rules and the `@keyframes blink`) since these are now owned by NavBar.tsx. Keep all other styles.

Also remove `@media(max-width:900px)` rule for `.nav-links{display:none;}` and `.nav-status{display:none;}` from the S string since NavBar handles that.

- [ ] **Step 11: Commit**

```bash
git add components/Homepage.jsx
git commit -m "fix: nav → NavBar, demo modal, mobile hero, footer links, explore links, final-cta wiring"
```

---

## Task 4: Update PricingPage.jsx (#3, #12, #14)

**Files:**
- Modify: `components/PricingPage.jsx`

- [ ] **Step 1: Add Clerk imports and useRouter, add NavBar**

Change the imports at the top of PricingPage.jsx:
```jsx
'use client';
import { useState, useEffect, useRef } from "react";
import { useUser, SignUpButton } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import NavBar from "./NavBar";
```

- [ ] **Step 2: Add cardsRef and update switchTab for scroll (#12)**

In the `PricingPage` component body, add:
```jsx
const cardsRef = useRef(null);
```

Replace `switchTab`:
```jsx
const switchTab = (tab) => {
  setActiveTab(tab);
  setTabKey(k => k + 1);
  setTimeout(() => {
    cardsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 50);
};
```

Add `ref={cardsRef}` to the `<div key={tabKey} className="tab-content">` element:
```jsx
<div key={tabKey} className="tab-content" ref={cardsRef}>
```

- [ ] **Step 3: Handle #api hash on mount**

In `PricingPage` component body, add:
```jsx
useEffect(() => {
  if (typeof window !== 'undefined' && window.location.hash === '#api') {
    setActiveTab('api');
  }
}, []);
```

Add `id="api"` to the API Credits tab-content div by wrapping it:
```jsx
{activeTab === "api" && (
  <div id="api-content">
    ...existing api content...
  </div>
)}
```

Also add the hidden anchor to the header so `#api` link from nav scrolls to the right place:
```jsx
{/* Hidden anchor for #api hash links */}
<div id="api" style={{position:'absolute',top:0,visibility:'hidden'}} aria-hidden="true" />
```
Place this as first child of `<div className="pricing-root">`.

- [ ] **Step 4: Wire CTA buttons (#3)**

Add `useUser` and `useRouter` in `PricingPage`:
```jsx
const { isSignedIn } = useUser();
const router = useRouter();
```

Modify `PlanCard` to accept and use Clerk wiring. Change `PlanCard`'s signature to:
```jsx
function PlanCard({ plan, isAnnual, isFree, isSignedIn, onUpgrade }) {
```

And replace:
```jsx
<button className={`cta-btn ${plan.highlight ? "primary" : "secondary"}`}>
  {plan.cta}
</button>
```

with:
```jsx
{(() => {
  const btnClass = `cta-btn ${plan.highlight ? "primary" : "secondary"}`;
  if (plan.cta === "Start Free" || plan.cta === "Get Started") {
    return (
      <SignUpButton mode="modal">
        <button className={btnClass}>{plan.cta}</button>
      </SignUpButton>
    );
  }
  if (plan.cta === "Go Pro") {
    return isSignedIn
      ? <button className={btnClass} onClick={() => onUpgrade('pro')}>{plan.cta}</button>
      : <SignUpButton mode="modal" redirectUrl="/dashboard?upgrade=pro"><button className={btnClass}>{plan.cta}</button></SignUpButton>;
  }
  if (plan.cta === "Go Whale") {
    return isSignedIn
      ? <button className={btnClass} onClick={() => onUpgrade('whale')}>{plan.cta}</button>
      : <SignUpButton mode="modal" redirectUrl="/dashboard?upgrade=whale"><button className={btnClass}>{plan.cta}</button></SignUpButton>;
  }
  return <button className={btnClass}>{plan.cta}</button>;
})()}
```

In `PricingPage`, pass new props to each `PlanCard`:
```jsx
{platformPlans.map((plan, i) => (
  <PlanCard
    key={i}
    plan={plan}
    isAnnual={isAnnual}
    isFree={false}
    isSignedIn={isSignedIn}
    onUpgrade={(tier) => router.push(`/dashboard?upgrade=${tier}`)}
  />
))}
```

- [ ] **Step 5: Fix annual badge text (#14)**

Change:
```jsx
{isAnnual && <div className="annual-badge">Save ~20%</div>}
```
to:
```jsx
{isAnnual && <div className="annual-badge">Save up to 19%</div>}
```

- [ ] **Step 6: Add NavBar to PricingPage**

In the PricingPage JSX, add `<NavBar />` as the first element inside `<>`:
```jsx
return (
  <>
    <style>{styles}</style>
    <NavBar />
    <div className="pricing-root" style={{paddingTop: '64px'}}>
      ...
    </div>
  </>
);
```
(Adding `paddingTop: '64px'` offsets the fixed nav height.)

- [ ] **Step 7: Commit**

```bash
git add components/PricingPage.jsx
git commit -m "fix: pricing page nav, CTA Clerk wiring, tab scroll, annual badge text, #api hash"
```

---

## Task 5: Verification (#after-all-fixes)

- [ ] **Step 1: Check for remaining href="#"**

```bash
grep -r 'href="#"' components/ app/ 2>/dev/null
```
Expected: no output (zero matches).

- [ ] **Step 2: Check Clerk imports are consistent**

```bash
grep -r "from \"@clerk/nextjs\"" components/ app/
```
Expected: NavBar.tsx, PricingPage.jsx (useUser, SignUpButton), Homepage.jsx (SignUpButton), layout.tsx (ClerkProvider).

- [ ] **Step 3: Run next build**

```bash
npm run build 2>&1 | tail -30
```
Expected: `✓ Compiled successfully` with zero TypeScript errors and zero build failures.

- [ ] **Step 4: Final commit if clean**

```bash
git add -A
git commit -m "chore: verify build passes, all 15 smoke-test issues resolved"
```
