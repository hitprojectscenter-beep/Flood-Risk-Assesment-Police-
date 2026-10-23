// TEMPORARY diagnostic — removed in the next commit
const URLS = [
  'https://www.arcgis.com/sharing/rest/content/items/847c4d466654462da72cb478f930d256?f=json',
  'https://open.govmap.gov.il/geoserver/opendata/wms?service=WMS&request=GetCapabilities',
  'https://api.govmap.gov.il/docs/javascript-functions/create-map',
  'https://api.govmap.gov.il/docs/intro/',
  'https://community.esri.com/t5/arcgis-enterprise-questions/converting-xyz-tile-request-to-govmap-gov-il/td-p/1339220',
  'https://cdnil.govmap.gov.il/xyz/heb/12/2446/1661.png',
];
export default async function handler(req, res) {
  const out = [];
  const list = req.query.u ? [req.query.u] : URLS;
  for (const u of list) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.govmap.gov.il/' }, signal: AbortSignal.timeout(15000) });
      const ct = r.headers.get('content-type') || '';
      const buf = Buffer.from(await r.arrayBuffer());
      const txt = /text|json|xml|html/.test(ct) ? buf.toString('utf8') : '';
      out.push({ u, status: r.status, ct, size: buf.length, cors: r.headers.get('access-control-allow-origin'), body: txt.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, +(req.query.n || 6000)) });
    } catch (e) { out.push({ u, error: String(e) }); }
  }
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(out, null, 1));
}
