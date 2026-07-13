import fastifyHelmet from '@fastify/helmet';
import type { FastifyInstance } from 'fastify';

export function registerSecurityHeaders(app: FastifyInstance): void {
  void app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        baseUri: ["'self'"],
        connectSrc: ["'self'"],
        defaultSrc: ["'self'"],
        fontSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        upgradeInsecureRequests: null,
      },
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });
}
