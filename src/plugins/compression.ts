import fastifyCompress from '@fastify/compress';
import type { FastifyInstance } from 'fastify';

export function registerCompression(
  app: FastifyInstance,
  production: boolean,
): void {
  if (!production) return;

  void app.register(fastifyCompress, {
    encodings: ['br', 'gzip'],
    globalDecompression: false,
    threshold: 1024,
  });
}
