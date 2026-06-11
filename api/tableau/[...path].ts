// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function handler(req: any, res: any): void {
  const pathParts = req.query?.path;
  const pathStr: string = Array.isArray(pathParts)
    ? pathParts.join('/')
    : (pathParts ?? '');

  const queryObj = req.query as Record<string, string | string[]> ?? {};
  const qParts = Object.entries(queryObj)
    .filter(([k]) => k !== 'path')
    .flatMap(([k, v]) =>
      (Array.isArray(v) ? v : [v]).map(
        (val) => `${encodeURIComponent(k)}=${encodeURIComponent(val)}`
      )
    );
  const qs = qParts.length > 0 ? `?${qParts.join('&')}` : '';

  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({
    method: req.method,
    url: req.url,
    pathStr,
    qs,
    targetUrl: `https://prod-apnortheast-a.online.tableau.com/${pathStr}${qs}`,
    query: queryObj,
    body: req.body,
  }, null, 2));
}
