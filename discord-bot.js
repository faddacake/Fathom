'use strict';
require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
  ]
});

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Fathom Bot online — logged in as ${c.user.tag}`);
  console.log(`📡 Serving ${c.guilds.cache.size} server(s)`);
});

client.on(Events.Error, (err) => {
  console.error('[bot] error:', err);
});

client.login(process.env.DISCORD_BOT_TOKEN);
