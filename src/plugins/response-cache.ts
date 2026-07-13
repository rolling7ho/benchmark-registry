import type { FastifyInstance } from 'fastify';

export function registerDynamicResponseCaching(app: FastifyInstance): void {
  app.addHook('onSend', (_request, reply, payload, done) => {
    const contentType = reply.getHeader('content-type');
    if (
      typeof contentType === 'string' &&
      contentType.toLowerCase().startsWith('text/html')
    ) {
      void reply.header('Cache-Control', 'no-cache');
    }
    done(null, payload);
  });
}
