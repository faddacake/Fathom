// utils/embeds.js
// All Discord EmbedBuilder factories live here.
// Keep display logic fully decoupled from business logic.
 
'use strict';
 
const { EmbedBuilder } = require('discord.js');
const { fmtPremium, fmtNum, fmtSentiment, fmtTime, fmtPolitician } = require('./formatters');
 
// ─── Brand colors ─────────────────────────────────────────────────────────────
const COLOR = {
  CALL:     0x00e5b4,   // teal
  PUT:      0xff4d6d,   // red
  DARK:     0x7c6fff,   // purple
  CONGRESS: 0xf0b429,   // gold
  NEUTRAL:  0x1c2433,
  ERROR:    0xff4d6d,
  SUCCESS:  0x3ecf4f,
  MARKET:   0x74b9ff,
};
 
// ─── Options Flow Alert ───────────────────────────────────────────────────────
function flowEmbed(trade) {
  const isBull    = trade.type === 'CALL';
  const isWhale   = trade.totalPremium >= 500_000;
  const typeEmoji = isBull ? '📈' : '📉';
  const sizeLabel = isWhale ? '🐋 WHALE' : trade.sweep ? '⚡ SWEEP' : '🧱 BLOCK';
  const title     = `${typeEmoji} ${trade.ticker} ${trade.type} — ${fmtPremium(trade.totalPremium)}`;
 
  return new EmbedBuilder()
    .setColor(isBull ? COLOR.CALL : COLOR.PUT)
    .setTitle(title)
    .setDescription(`${sizeLabel}  •  ${fmtSentiment(isBull)}`)
    .addFields(
      { name: '💰 Strike',          value: `$${trade.strike}`,                    inline: true },
      { name: '📅 Expiry',          value: trade.expiry,                           inline: true },
      { name: '📆 DTE',             value: `${trade.dte}d`,                        inline: true },
      { name: '💵 Prem / Contract', value: `$${Number(trade.premium).toFixed(2)}`, inline: true },
      { name: '📊 Contracts',       value: fmtNum(trade.size),                     inline: true },
      { name: '💎 Total Premium',   value: `**${fmtPremium(trade.totalPremium)}**`,inline: true },
      { name: '🔁 Execution',       value: trade.sweep ? 'Multi-leg Sweep' : 'Block Trade', inline: true },
      { name: '🏷️ Sector',          value: trade.sector || 'Unknown',              inline: true },
      { name: '⏰ Filed At',         value: fmtTime(trade.timestamp),               inline: true },
    )
    .setFooter({ text: 'Fathom · We measure what others can\'t see' })
    .setTimestamp();
}
 
// ─── Dark Pool Alert ──────────────────────────────────────────────────────────
function darkPoolEmbed(print) {
  const isBull = print.signal === 'ACCUMULATION';
  return new EmbedBuilder()
    .setColor(COLOR.DARK)
    .setTitle(`🌑 DARK POOL PRINT — ${print.ticker}`)
    .setDescription(
      isBull
        ? '🟢 **ACCUMULATION** — Institutional buying detected off-exchange'
        : '🔴 **DISTRIBUTION** — Institutional selling detected off-exchange'
    )
    .addFields(
      { name: '📦 Shares',       value: fmtNum(print.shares),       inline: true },
      { name: '💵 Est. Value',   value: fmtPremium(print.value),    inline: true },
      { name: '📊 Signal',       value: print.signal,               inline: true },
      { name: '📈 Avg Price',    value: `$${Number(print.avgPrice).toFixed(2)}`, inline: true },
      { name: '🔄 Exchange',     value: print.exchange || 'Off-Exchange', inline: true },
      { name: '⏰ Time',         value: fmtTime(print.timestamp),   inline: true },
    )
    .setFooter({ text: 'Fathom · Dark Pool · fathom.trade' })
    .setTimestamp();
}
 
// ─── Congressional Trade Alert ────────────────────────────────────────────────
function congressEmbed(trade) {
  const isBuy    = trade.transactionType.toLowerCase().includes('buy');
  const emoji    = isBuy ? '💰' : '🚪';
  const partyTag = trade.party === 'R' ? '🔴 Republican' : '🔵 Democrat';
 
  return new EmbedBuilder()
    .setColor(COLOR.CONGRESS)
    .setTitle(`🏛️ CONGRESSIONAL TRADE DISCLOSED`)
    .setDescription(`${emoji} **${trade.name}** (${partyTag}) just ${isBuy ? 'purchased' : 'sold'} **${trade.ticker}**`)
    .addFields(
      { name: '📊 Ticker',         value: trade.ticker,                     inline: true },
      { name: '📋 Transaction',     value: trade.transactionType,            inline: true },
      { name: '💵 Amount Range',    value: trade.amountRange,                inline: true },
      { name: '📅 Transaction Date',value: trade.transactionDate,            inline: true },
      { name: '📁 Filed Date',      value: trade.filedDate,                  inline: true },
      { name: '🏛️ Committee',       value: trade.committee || 'N/A',         inline: true },
      {
        name:  '⚠️ Context',
        value: `${fmtPolitician(trade.name)} sits on the **${trade.committee || 'relevant'}** committee. Cross-reference upcoming legislation for context.`,
        inline: false,
      },
    )
    .setFooter({ text: 'Fathom · Congress Trades · fathom.trade' })
    .setTimestamp();
}
 
// ─── Market Open Digest ───────────────────────────────────────────────────────
function marketOpenEmbed({ spy, qqq, vix, topBullish, topBearish, gexLevel }) {
  return new EmbedBuilder()
    .setColor(COLOR.MARKET)
    .setTitle('🔔 MARKET OPEN — Fathom Daily Digest')
    .setDescription(`Good morning traders. Markets are open. Here's your pre-market structure.`)
    .addFields(
      { name: '📊 SPY',             value: `$${spy.price} ${spy.chg >= 0 ? '▲' : '▼'}${Math.abs(spy.chg).toFixed(2)}%`, inline: true },
      { name: '📊 QQQ',             value: `$${qqq.price} ${qqq.chg >= 0 ? '▲' : '▼'}${Math.abs(qqq.chg).toFixed(2)}%`, inline: true },
      { name: '😱 VIX',             value: `${vix.price} (${vix.chg >= 0 ? '▲' : '▼'}${Math.abs(vix.chg).toFixed(2)}%)`, inline: true },
      { name: '📍 SPY GEX Level',   value: `$${gexLevel} (key magnet)`,       inline: true },
      { name: '🟢 Top Bullish Flow', value: topBullish.join('\n') || 'None yet', inline: true },
      { name: '🔴 Top Bearish Flow', value: topBearish.join('\n') || 'None yet', inline: true },
      {
        name: '📌 Key Levels to Watch',
        value: `**Support:** $${spy.support} · **Resistance:** $${spy.resistance}\nFlow sentiment at open: ${spy.sentimentLabel}`,
        inline: false,
      },
    )
    .setFooter({ text: 'Fathom · Market Open · 9:30 AM ET' })
    .setTimestamp();
}
 
// ─── Market Close Recap ───────────────────────────────────────────────────────
function marketCloseEmbed({ totalPremium, bullRatio, bearRatio, topTrades, pcRatio }) {
  return new EmbedBuilder()
    .setColor(COLOR.NEUTRAL)
    .setTitle('🔔 MARKET CLOSE — Flow Recap')
    .setDescription('The closing bell has rung. Here\'s what the smart money did today.')
    .addFields(
      { name: '💎 Total Premium',   value: fmtPremium(totalPremium), inline: true },
      { name: '🟢 Bullish Flow',    value: `${bullRatio}%`,           inline: true },
      { name: '🔴 Bearish Flow',    value: `${bearRatio}%`,           inline: true },
      { name: '📊 Put/Call Ratio',  value: pcRatio.toFixed(2),        inline: true },
      { name: '🐋 Top Whale Trades',value: topTrades.slice(0,5).map(
          t => `**${t.ticker}** ${t.type} ${fmtPremium(t.totalPremium)}`
        ).join('\n'),
        inline: false,
      },
    )
    .setFooter({ text: 'Fathom · Daily Recap · fathom.trade' })
    .setTimestamp();
}
 
// ─── GEX Level Embed ─────────────────────────────────────────────────────────
function gexEmbed({ ticker, currentPrice, gexLevels, netGamma, flipLevel }) {
  const fields = gexLevels.slice(0, 6).map(level => ({
    name:   `$${level.strike}`,
    value:  `GEX: ${level.gex >= 0 ? '+' : ''}${(level.gex / 1e9).toFixed(2)}B`,
    inline: true,
  }));
 
  return new EmbedBuilder()
    .setColor(COLOR.CALL)
    .setTitle(`📐 GEX ANALYSIS — ${ticker}`)
    .setDescription(
      `Current Price: **$${currentPrice}**\n` +
      `Net Gamma: **${netGamma >= 0 ? 'Positive' : 'Negative'} (${netGamma >= 0 ? 'Dealer Long Gamma → Dampening' : 'Dealer Short Gamma → Amplifying'})**\n` +
      `Gamma Flip Level: **$${flipLevel}**`
    )
    .addFields(...fields)
    .addFields({
      name: '📖 What This Means',
      value: netGamma >= 0
        ? `Dealers are long gamma. Expect price to be pinned near $${flipLevel}. Low volatility expected near key strikes.`
        : `Dealers are short gamma. Price moves are being amplified. High volatility expected. Stay nimble.`,
      inline: false,
    })
    .setFooter({ text: 'Fathom · GEX Analysis · fathom.trade' })
    .setTimestamp();
}
 
// ─── Screener Results ────────────────────────────────────────────────────────
function screenerEmbed(results, filterSummary) {
  const top = results.slice(0, 8);
  return new EmbedBuilder()
    .setColor(COLOR.NEUTRAL)
    .setTitle(`🔍 SCREENER RESULTS — ${results.length} matches`)
    .setDescription(`Filters: ${filterSummary}`)
    .addFields(
      top.map(t => ({
        name:   `${t.bull ? '📈' : '📉'} ${t.ticker} ${t.type}`,
        value:  `${t.strike} · ${t.expiry} · **${fmtPremium(t.totalPremium)}**`,
        inline: true,
      }))
    )
    .setFooter({ text: `Fathom · Screener · Showing top ${top.length} of ${results.length}` })
    .setTimestamp();
}
 
// ─── Error / Permission embed ─────────────────────────────────────────────────
function errorEmbed(message, upgradeRequired = false) {
  const embed = new EmbedBuilder()
    .setColor(COLOR.ERROR)
    .setTitle(upgradeRequired ? '🔒 Pro Feature' : '❌ Error')
    .setDescription(message);
 
  if (upgradeRequired) {
    embed.addFields({
      name: '⚡ Upgrade Now',
      value: '[View pricing at fathom.trade/pricing](https://fathom.trade/pricing)',
      inline: false,
    });
  }
 
  return embed;
}
 
// ─── Help embed ───────────────────────────────────────────────────────────────
function helpEmbed(tier) {
  return new EmbedBuilder()
    .setColor(COLOR.CALL)
    .setTitle('🌊 Fathom Bot — Command Reference')
    .setDescription(`Your tier: **${tier.name}** · [Upgrade](https://fathom.trade/pricing)`)
    .addFields(
      { name: '⚡ /flow [ticker]',           value: 'Options flow for a ticker or latest unusual activity', inline: false },
      { name: '🐋 /whale',                   value: 'Latest extreme whale prints ($500K+ premium)',        inline: false },
      { name: '🌑 /darkpool [ticker]',       value: 'Dark pool prints for a ticker',                      inline: false },
      { name: '🏛️ /congress [name]',         value: 'Congressional trades by politician or all recent',   inline: false },
      { name: '📐 /gex [ticker]',            value: 'Gamma exposure levels and flip point',               inline: false },
      { name: '🔍 /screener',                value: 'Run the options screener with custom filters',        inline: false },
      { name: '🔔 /alert create|list|delete',value: 'Manage your personal alert rules',                   inline: false },
      { name: '💼 /portfolio [ticker]',      value: 'Track or view your watchlist',                       inline: false },
    )
    .setFooter({ text: 'Fathom · fathom.trade · We measure what others can\'t see' });
}
 
module.exports = {
  flowEmbed, darkPoolEmbed, congressEmbed,
  marketOpenEmbed, marketCloseEmbed,
  gexEmbed, screenerEmbed, errorEmbed, helpEmbed,
};