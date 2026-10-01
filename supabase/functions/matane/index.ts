// またね Edge Function
// - Googleマップの共有リンク（maps.app.goo.gl/… の短いリンク）を、ブラウザの代わりに開いて
//   行き先の長いURLと、ページに書いてある場所の名前・住所（og:title / og:description）を返す。
//   ブラウザからは短いリンクの転送先を読めない（CORS）ので、ここで代わりに辿る。
// - 認証: 部屋IDが実在すること（部屋IDを知っている＝ふたりのどちらか）。verify_jwt は無効
// - 行き先は Google のドメインだけ（ほかのサイトを代わりに読みに行く踏み台にさせない）
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
// Googleマップのリンクとして受け付けるホスト
const MAPS_HOST = /^(maps\.app\.goo\.gl|goo\.gl|g\.co|maps\.google\.[a-z.]+|(www\.)?google\.[a-z.]+)$/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
async function roomExists(room: unknown): Promise<boolean> {
  if (typeof room !== 'string' || !/^[A-Za-z0-9]{12,32}$/.test(room)) return false;
  const { data } = await db.from('matane_rooms').select('id').eq('id', room).maybeSingle();
  return !!data;
}
function isMapsUrl(u: URL) {
  if (!MAPS_HOST.test(u.hostname)) return false;
  if (/^(goo\.gl|g\.co)$/i.test(u.hostname)) return u.pathname.startsWith('/maps') || u.hostname === 'g.co';
  if (/google\./i.test(u.hostname) && !/^maps\./i.test(u.hostname)) return u.pathname.startsWith('/maps') || u.searchParams.has('cid') || u.searchParams.has('q');
  return true;
}
function meta(html: string, prop: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:property|itemprop|name)=["']${prop}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|itemprop|name)=["']${prop}["']`, 'i');
  const m = re.exec(html);
  const v = m?.[1] ?? m?.[2];
  if (!v) return null;
  return v.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim() || null;
}

async function expand(raw: string) {
  let u: URL;
  try { u = new URL(raw); } catch { return { error: 'bad url' }; }
  if (!isMapsUrl(u)) return { error: 'not maps' };
  // 転送をたどる（Google のドメインの中だけ。同意画面など外に出たら、そこで止める）
  for (let i = 0; i < 6; i++) {
    const res = await fetch(u, { redirect: 'manual', headers: { 'User-Agent': UA, 'Accept-Language': 'ja,en;q=0.5' } });
    const loc = res.headers.get('location');
    try { await res.body?.cancel(); } catch { /* 無視 */ }
    if (res.status >= 300 && res.status < 400 && loc) {
      const next = new URL(loc, u);
      if (!MAPS_HOST.test(next.hostname)) break;
      u = next;
      continue;
    }
    break;
  }
  // ページに書いてある名前・住所（場所のページなら「名前 · 住所」）
  let title: string | null = null;
  let desc: string | null = null;
  try {
    const res = await fetch(u, { headers: { 'User-Agent': UA, 'Accept-Language': 'ja,en;q=0.5' } });
    if (res.ok) {
      const html = (await res.text()).slice(0, 600000);
      title = meta(html, 'og:title');
      desc = meta(html, 'og:description');
    }
  } catch { /* 名前が取れなくても URL だけ返す */ }
  return { url: u.toString(), title, desc };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  if (!(await roomExists(body?.room))) return json({ error: 'room' }, 403);
  if (body?.action === 'mapsLink') {
    if (typeof body.url !== 'string' || body.url.length > 2000) return json({ error: 'bad url' }, 400);
    try { return json(await expand(body.url)); } catch (e) { return json({ error: String(e?.message ?? e) }, 502); }
  }
  return json({ error: 'unknown action' }, 400);
});
