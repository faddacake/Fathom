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
  { label: 'Features',  href: '/#features'   },
  { label: 'Dark Pool', href: '/#dark-pool'  },
  { label: 'Congress',  href: '/#congress'   },
  { label: 'API',       href: '/pricing#api' },
  { label: 'Pricing',   href: '/pricing'     },
  { label: 'Discord',   href: '/#discord'    },
];

const NAV_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@300;400;500;600&family=DM+Mono:wght@300;400;500&display=swap');
.nb-nav{
  position:fixed;top:0;left:0;right:0;z-index:100;
  display:flex;align-items:center;justify-content:space-between;
  padding:0 32px;height:64px;
  background:rgba(6,8,16,0.82);
  backdrop-filter:blur(16px);
  border-bottom:1px solid rgba(0,229,180,0.11);
}
.nb-logo{
  display:flex;align-items:center;gap:10px;
  font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:0.04em;color:#e8edf5;
  text-decoration:none;
}
.nb-logo-mark{
  width:30px;height:30px;background:#00e5b4;border-radius:7px;
  display:flex;align-items:center;justify-content:center;
  font-size:14px;font-weight:700;color:#060810;
}
.nb-links{display:flex;align-items:center;gap:28px;}
.nb-link{font-size:13.5px;color:#5a6a7a;transition:color .15s;font-weight:500;text-decoration:none;}
.nb-link:hover{color:#e8edf5;}
.nb-actions{display:flex;align-items:center;gap:10px;}
.nb-login{font-size:13px;color:#5a6a7a;padding:8px 16px;border-radius:8px;border:1px solid rgba(0,229,180,0.11);background:transparent;cursor:pointer;transition:all .15s;font-family:'Outfit',sans-serif;}
.nb-login:hover{color:#e8edf5;border-color:rgba(255,255,255,0.2);}
.nb-cta{font-size:13px;font-weight:600;padding:9px 18px;border-radius:8px;background:#00e5b4;color:#060810;border:none;cursor:pointer;transition:all .15s;letter-spacing:0.02em;font-family:'Outfit',sans-serif;}
.nb-cta:hover{background:#00ffcc;box-shadow:0 4px 16px rgba(0,229,180,0.35);}
.nb-dashboard{font-size:13px;font-weight:600;padding:9px 18px;border-radius:8px;background:#00e5b4;color:#060810;border:none;cursor:pointer;transition:all .15s;text-decoration:none;display:inline-block;letter-spacing:0.02em;font-family:'Outfit',sans-serif;}
.nb-dashboard:hover{background:#00ffcc;}
.nb-status{display:flex;align-items:center;gap:6px;font-family:'DM Mono',monospace;font-size:11px;color:#5a6a7a;padding:5px 10px;background:#0d1117;border:1px solid rgba(0,229,180,0.11);border-radius:6px;}
.nb-status-dot{width:6px;height:6px;border-radius:50%;}
@keyframes nb-blink{0%,100%{opacity:1}50%{opacity:0.4}}
.nb-hamburger{
  display:none;background:transparent;border:none;cursor:pointer;
  padding:8px;color:#e8edf5;font-size:20px;line-height:1;
}
.nb-drawer{
  position:fixed;top:64px;left:0;right:0;z-index:99;
  background:#060810;border-bottom:1px solid rgba(0,229,180,0.11);
  padding:16px 24px 24px;
  display:flex;flex-direction:column;gap:4px;
}
.nb-drawer-link{
  display:block;padding:12px 8px;font-size:15px;color:#5a6a7a;
  border-radius:8px;transition:all .15s;text-decoration:none;
  font-family:'Outfit',sans-serif;
}
.nb-drawer-link:hover{color:#e8edf5;background:rgba(255,255,255,0.04);}
.nb-drawer-auth{
  display:flex;gap:10px;margin-top:12px;padding-top:12px;
  border-top:1px solid rgba(0,229,180,0.11);
}
.nb-drawer-auth .nb-login,.nb-drawer-auth .nb-cta{flex:1;text-align:center;}
@media(max-width:900px){
  .nb-nav{padding:0 20px;}
  .nb-links{display:none;}
  .nb-status{display:none;}
  .nb-hamburger{display:block;}
}
`;

export default function NavBar() {
  const marketOpen = useMarketStatus();
  const { isSignedIn } = useUser();
  const [mobileOpen, setMobileOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (mobileOpen && drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setMobileOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [mobileOpen]);

  const dotStyle = {
    background: marketOpen ? '#3ecf4f' : '#ff4d6d',
    boxShadow: marketOpen ? '0 0 6px #3ecf4f' : '0 0 6px #ff4d6d',
    animation: 'nb-blink 2s infinite',
  };

  return (
    <>
      <style>{NAV_CSS}</style>
      <nav className="nb-nav">
        <Link href="/" className="nb-logo">
          <div className="nb-logo-mark">F</div>
          FATHOM
        </Link>

        <div className="nb-links">
          {NAV_LINKS.map(({ label, href }) => (
            <a key={label} href={href} className="nb-link">{label}</a>
          ))}
        </div>

        <div className="nb-actions">
          <div
            className="nb-status"
            style={{ borderColor: marketOpen ? 'rgba(62,207,79,0.3)' : 'rgba(255,77,109,0.3)' }}
          >
            <div className="nb-status-dot" style={dotStyle} />
            {marketOpen ? 'Markets Open' : 'Markets Closed'}
          </div>

          {isSignedIn ? (
            <Link href="/dashboard" className="nb-dashboard">Dashboard →</Link>
          ) : (
            <>
              <SignInButton mode="modal">
                <button className="nb-login">Log in</button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="nb-cta">Start Free →</button>
              </SignUpButton>
            </>
          )}

          <button
            className="nb-hamburger"
            onClick={() => setMobileOpen(v => !v)}
            aria-label="Toggle navigation"
          >
            {mobileOpen ? '✕' : '☰'}
          </button>
        </div>
      </nav>

      {mobileOpen && (
        <div className="nb-drawer" ref={drawerRef}>
          {NAV_LINKS.map(({ label, href }) => (
            <a
              key={label}
              href={href}
              className="nb-drawer-link"
              onClick={() => setMobileOpen(false)}
            >
              {label}
            </a>
          ))}
          <div className="nb-drawer-auth">
            {isSignedIn ? (
              <Link
                href="/dashboard"
                className="nb-dashboard"
                style={{ flex: 1, textAlign: 'center' }}
                onClick={() => setMobileOpen(false)}
              >
                Dashboard →
              </Link>
            ) : (
              <>
                <SignInButton mode="modal">
                  <button className="nb-login" onClick={() => setMobileOpen(false)}>Log in</button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <button className="nb-cta" onClick={() => setMobileOpen(false)}>Start Free →</button>
                </SignUpButton>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
