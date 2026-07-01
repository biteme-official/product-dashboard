/**
 * Tableau REST API 프록시
 * /api/tableau/* 요청을 prod-apnortheast-a.online.tableau.com 으로 전달합니다.
 * vercel.json routes: { "src": "/api/tableau/(.*)", "dest": "/api/tableau-proxy?_path=$1" }
 */
const TARGET = 'https://prod-apnortheast-a.online.tableau.com';

const DROP_REQ = new Set([
  'host', 'connection', 'transfer-encoding', 'content-length',
  'x-vercel-id', 'x-vercel-deployment-url',
  'x-vercel-forwarded-for', 'x-vercel-ip-country',
  'x-real-ip', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto',
]);

const DROP_RES = new Set([
  'transfer-encoding', 'connection', 'content-encoding', 'content-length',
]);

const ALLOWED_ORIGINS = new Set([
  'https://biteme-portal-hub.vercel.app',
  'https://product-dashboard-delta-taupe.vercel.app',
]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: any, res: any): Promise<void> {
  const origin = req.headers['origin'] as string | undefined;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, X-Tableau-Auth');
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  // _path 파라미터에서 Tableau 경로 추출, 나머지는 쿼리스트링으로 전달
  const query = req.query as Record<string, string | string[]>;
  const subpath = (query['_path'] as string) ?? '';

  const extraQs = Object.entries(query)
    .filter(([k]) => k !== '_path')
    .flatMap(([k, v]) =>
      (Array.isArray(v) ? v : [v]).map(
        (val) => `${encodeURIComponent(k)}=${encodeURIComponent(val)}`
      )
    )
    .join('&');

  const targetUrl = `${TARGET}/${subpath}${extraQs ? '?' + extraQs : ''}`;

  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers ?? {})) {
    if (DROP_REQ.has(k.toLowerCase())) continue;
    headers[k] = Array.isArray(v) ? (v as string[]).join(', ') : ((v as string) ?? '');
  }

  const init: RequestInit = { method: (req.method as string) ?? 'GET', headers };

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
    console.error('[tableau-proxy] error:', String(err));
    res.statusCode = 502;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'proxy_error', message: String(err) }));
  }
}
