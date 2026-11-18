// Same-origin proxy: the browser calls /api/*, this forwards to groundwork-api.
// API_URL is read at request time, so the same build works anywhere.
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const FORWARD_REQ = ['content-type', 'cookie', 'accept', 'user-agent'];

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const base = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
  const url = `${base}/api/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;

  const headers = new Headers();
  for (const h of FORWARD_REQ) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  const init: RequestInit = { method: req.method, headers, redirect: 'manual', cache: 'no-store' };
  if (req.method !== 'GET' && req.method !== 'HEAD') init.body = await req.arrayBuffer();

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    return Response.json({ statusCode: 502, message: 'Cannot reach groundwork-api. Is it running?' }, { status: 502 });
  }

  const out = new Headers();
  const ct = res.headers.get('content-type');
  if (ct) out.set('content-type', ct);
  for (const cookie of res.headers.getSetCookie()) out.append('set-cookie', cookie);
  const body = res.status === 204 || res.status === 304 ? null : await res.arrayBuffer();
  return new Response(body, { status: res.status, headers: out });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
