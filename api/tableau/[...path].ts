const TARGET = 'https://prod-apnortheast-a.online.tableau.com';

const DROP_REQ = new Set([
  'host', 'connection', 'transfer-encoding',
  'x-vercel-id', 'x-vercel-deployment-url',
  'x-vercel-forwarded-for', 'x-vercel-ip-country',
  'x-real-ip', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto',
]);

const DROP_RES = new Set([
  'transfer-encoding', 'connection', 'content-encoding', 'content-length',
]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: any, res: any): Promise<void> {
  const pathParts = req.query?.path;
  const pathStr: string = Array.isArray(pathParts)
    ? pathParts.join('/')
    : (pathParts ?? '');

  // 원본 query string 유지 (maxAge=60 등)
  const rawUrl: string = req.url ?? '/';
  const qIdx = rawUrl.indexOf('?');
  const qs = qIdx >= 0 ? rawUrl.slice(qIdx) : '';

  const targetUrl = `${TARGET}/${pathStr}${qs}`;

  // Vercel 내부 헤더 제거 후 나머지 전달
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers ?? {})) {
    if (DROP_REQ.has(k.toLowerCase())) continue;
    headers[k] = Array.isArray(v) ? (v as string[]).join(', ') : ((v as string) ?? '');
  }

  const init: RequestInit = { method: (req.method as string) ?? 'GET', headers };

  // POST/PUT/PATCH body 전달
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.body !== undefined) {
    const ct = (headers['content-type'] ?? '').toLowerCase();
    init.body = ct.includes('application/json') && typeof req.body === 'object'
      ? JSON.stringify(req.body)
      : (req.body as BodyInit);
  }

  try {
    const upstream = await fetch(targetUrl, init);
    upstream.headers.forEach((v: string, k: string) => {
      if (!DROP_RES.has(k.toLowerCase())) res.setHeader(k, v);
    });
    const text = await upstream.text();
    res.statusCode = upstream.status;
    res.end(text);
  } catch (err) {
    console.error('[tableau-proxy]', String(err));
    res.statusCode = 502;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'proxy_error', message: String(err) }));
  }
}
