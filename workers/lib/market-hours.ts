export type MarketSession = 'premarket' | 'open' | 'afterhours' | 'closed';

export function getMarketSession(): MarketSession {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay(); // 0=Sun, 6=Sat

  if (day === 0 || day === 6) return 'closed';

  const mins = et.getHours() * 60 + et.getMinutes();

  if (mins < 4 * 60) return 'closed';
  if (mins < 9 * 60 + 30) return 'premarket';
  if (mins < 16 * 60) return 'open';
  if (mins < 20 * 60) return 'afterhours';
  return 'closed';
}

export function isMarketOpen(): boolean {
  return getMarketSession() === 'open';
}

/** Connect WebSocket during pre-market and regular hours; pause overnight. */
export function shouldConnectWebSocket(): boolean {
  const s = getMarketSession();
  return s === 'premarket' || s === 'open';
}
