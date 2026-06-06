import cors from '@fastify/cors';
import Fastify from 'fastify';
import { env } from './env';
import { registerSocialRoutes } from './routes/social';

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(registerSocialRoutes);

await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
