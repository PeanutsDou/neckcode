import { initDb, closeDb } from './db';
import { startServer, stopServer } from './ws-handler';
import { logger } from './logger';
import { config } from './config';

function main(): void {
  logger.info('Starting IM Server', {
    host: config.host,
    port: config.port,
    dbPath: config.dbPath,
  });

  // 初始化数据库
  initDb();

  // 启动 WebSocket 服务
  const wss = startServer();

  // 优雅关闭
  function shutdown() {
    logger.info('Shutting down...');
    stopServer(wss);
    closeDb();
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
