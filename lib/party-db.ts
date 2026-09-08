import { env } from 'cloudflare:workers';
import hostingConfig from '../.openai/hosting.json';
import type { PartyDatabase } from './party-server';

/** The D1 binding is provisioned by Sites; the API never creates database tables at runtime. */
export function rawD1(): PartyDatabase {
  const binding = hostingConfig.d1;
  if (!binding) throw new Error('The party database binding is not configured.');
  const database = (env as unknown as Record<string, unknown>)[binding] as PartyDatabase | undefined;
  if (!database || typeof database.prepare !== 'function' || typeof database.batch !== 'function') throw new Error('The party database binding is unavailable.');
  return database;
}
