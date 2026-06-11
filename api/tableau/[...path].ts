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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: any, res: any): Promise<void> {
  // catch-all [path] 세그먼트 → Tableau 경로 재구성
  const pathParts = req.query?.path;
  const pathStr: string = Array.isArray(pathParts)
    ? pathParts.join('/')
    : (pathParts ?? '');

  // req.url에는 Vercel이 ?path=... 파라미터를 포함시키므로
  // req.query에서 'path' 키를 제외한 나머지 파라미터만 query string으로 재구성
  const queryObj = req.query as Record<string, string | string[]> ?? {};
  const qParts = Object.entries(queryObj)
    .filter(([k]) => k !== 'path')
    .flatMap(([k, v]) =>
      (Array.isArray(v) ? v : [v]).map(
        (val) => `${encodeURIComponent(k)}=${encodeURIComponent(val)}`
      )
    );
  const qs = qParts.length > 0 ? `?${qParts.join('&')}` : '';

  const targetUrl = `${TARGET}/${pathStr}${qs}`;
  console.log('[tableau-proxy]', req.method, targetUrl);

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
    console.error('[tableau-proxy] fetch error:', String(err));
    res.statusCode = 502;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'proxy_error', message: String(err) }));
  }
}
