// ─── Error handlers ───────────────────────────────────────────────────────────
client.on(Events.Error, (err) => {
  logger.error('Discord client error:', err);
});
 
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled promise rejection:', err);
});
 
process.on('SIGINT', async () => {
  logger.info('SIGINT received — shutting down gracefully…');
  alertEngine.stop();
  autoPostSvc.stop();
  await client.destroy();
  process.exit(0);
});
 
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — shutting down gracefully…');
  alertEngine.stop();
  autoPostSvc.stop();
  await client.destroy();
  process.exit(0);
});
 
// ─── Login ────────────────────────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN).catch((err) => {
  logger.error('Failed to log in:', err.message);
  process.exit(1);
});