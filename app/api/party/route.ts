import { rawD1 } from '@/lib/party-db';
import { handlePartyRequest } from '@/lib/party-server';

export async function POST(request: Request): Promise<Response> {
  try { return await handlePartyRequest(request, rawD1()); }
  catch {
    return Response.json({ error: 'Phone controllers are not available yet. Please try again in a moment.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
