import { createApp } from './application.js';
import { loadEnvironment } from './config/env.js';
import { createDatabase } from './db/database.js';

async function startServer(): Promise<void> {
  let app: ReturnType<typeof createApp> | undefined;

  try {
    const environment = loadEnvironment();
    const database = createDatabase(environment.DATABASE_URL);
    const currentApp = createApp({
      database,
      rateLimitSecret:
        environment.FEEDBACK_RATE_LIMIT_SECRET ?? environment.DATABASE_URL,
      ...(environment.ADMIN_USERNAME === undefined
        ? {}
        : {
            adminAuth: {
              username: environment.ADMIN_USERNAME,
              password: environment.ADMIN_PASSWORD!,
            },
          }),
    });
    app = currentApp;

    let isShuttingDown = false;
    const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
      if (isShuttingDown) {
        return;
      }

      isShuttingDown = true;
      currentApp.log.info({ signal }, 'Shutting down');

      try {
        await currentApp.close();
      } catch (error) {
        currentApp.log.error(error, 'Failed to shut down cleanly');
        process.exitCode = 1;
      }
    };

    process.once('SIGINT', () => void shutdown('SIGINT'));
    process.once('SIGTERM', () => void shutdown('SIGTERM'));

    await currentApp.listen({
      host: environment.HOST,
      port: environment.PORT,
    });
  } catch (error) {
    if (app === undefined) {
      console.error('Fatal startup failure', error);
    } else {
      app.log.error(error, 'Fatal startup failure');

      try {
        await app.close();
      } catch (closeError) {
        app.log.error(closeError, 'Failed to close after startup failure');
      }
    }

    process.exitCode = 1;
  }
}

void startServer();
