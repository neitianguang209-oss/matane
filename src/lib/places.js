// 場所の候補：タイトルから、行きたいお店・駅・山・施設などの候補を出す
// Photon（OpenStreetMap のデータ。キー不要・無料・打ちながら検索してよいサービス）を使う。
// 「鎌倉のしらす丼」のような書き方でも当たるよう、「の」「で」などで区切った言葉でも探す。

import { SUPABASE_URL } from '../config.js';
const PHOTON = 'https://photon.komoot.io/api/';
const JAPAN = '122,24,154,46';   // 日本のあたりだけ（minLon,minLat,maxLon,maxLat）

// よく使う言い回し（地名ではないので、これだけでは探さない）
const GENERIC = /^(カフェ|ランチ|ディナー|ご飯|ごはん|旅行|散歩|お店|店|行く|行きたい|食べたい|やりたい|食べる|巡り|めぐり|デート|観光|買い物|ショッピング|展示|ライブ|イベント|見る|見に行く|に行く|へ行く)$/;

// タイトルから、場所の名前らしい部分を取り出す（純粋な関数。tests.html でテスト）
export function placeQueries(title) {
  const t = String(title || '').normalize('NFKC').trim();
  if (!t) return [];
  const out = [t];
  const parts = t
    .replace(/[「」『』()（）【】]/g, ' ')
    .split(/[\s　、,・/]+|の(?=.)|で(?=.)|に行|へ行|にある|まで/)
    .map((s) => s.replace(/(に行きたい|行きたい|に行く|へ行く|を見る|を食べる|食べたい|やりたい|したい|めぐり|巡り|に登る|登る)$/, '').trim())
    .filter((s) => s.length >= 2 && !GENERIC.test(s));
  for (const p of parts) if (!out.includes(p)) out.push(p);
  return out.slice(0, 3);
}

const TYPE_LABEL = {
  station: '駅', halt: '駅', peak: '山', volcano: '山', museum: '博物館・美術館', gallery: 'ギャラリー', artwork: 'アート',
  restaurant: '飲食店', cafe: 'カフェ', fast_food: '飲食店', bar: 'バー', pub: '居酒屋', seafood: '海鮮', bakery: 'パン屋',
  confectionery: 'お菓子', ice_cream: 'アイス', park: '公園', garden: '庭園', nature_reserve: '自然', beach: '海岸',
  attraction: '観光地', viewpoint: '展望', theme_park: 'テーマパーク', zoo: '動物園', aquarium: '水族館', hotel: 'ホテル',
  place_of_worship: '寺社', shrine: '神社', temple: '寺', castle: '城', island: '島', islet: '島', mall: 'ショッピング',
  department_store: 'デパート', cinema: '映画館', theatre: '劇場', stadium: 'スタジアム', hot_spring: '温泉', spa: '温泉',
  city: '市', town: '町', village: '村', suburb: '地域', quarter: '地域', neighbourhood: '地域', locality: '地域', hamlet: '地域',
  district: '地域', county: '郡', state: '都道府県', lake: '湖', river: '川', waterfall: '滝', mountain_range: '山地',
};
const SKIP = new Set(['love_hotel', 'bus_stop', 'stop', 'platform', 'stop_position', 'stream', 'ditch', 'drain', 'yes', 'house', 'residential', 'parking', 'toilets', 'atm', 'it', 'office', 'company']);

export function toPlace(f) {
  const p = f.properties ?? {};
  const [lon, lat] = f.geometry?.coordinates ?? [];
  const city = p.city || p.county || p.district || '';
  const state = p.state || '';
  const where = [...new Set([city, state].filter(Boolean))].filter((x) => x !== p.name).join('・');
  return {
    name: p.name,
    where,
    kind: TYPE_LABEL[p.osm_value] ?? TYPE_LABEL[p.type] ?? '',
    lat: typeof lat === 'number' ? Math.round(lat * 1e5) / 1e5 : null,
    lon: typeof lon === 'number' ? Math.round(lon * 1e5) / 1e5 : null,
    skip: !p.name || SKIP.has(p.osm_value) || (p.countrycode && p.countrycode !== 'JP'),
  };
}

// 近い場所を先に出すための目安（ふたりが今まで選んだ場所の真ん中。無ければ東京）
export function biasFrom(wishes) {
  const pts = wishes.map((w) => w.place).filter((p) => p && typeof p.lat === 'number' && typeof p.lon === 'number');
  if (!pts.length) return { lat: 35.68, lon: 139.77 };
  return {
    lat: Math.round((pts.reduce((s, p) => s + p.lat, 0) / pts.length) * 100) / 100,
    lon: Math.round((pts.reduce((s, p) => s + p.lon, 0) / pts.length) * 100) / 100,
  };
}

async function photon(q, signal, bias) {
  const params = new URLSearchParams({ q, limit: '6', bbox: JAPAN });
  if (bias) { params.set('lat', String(bias.lat)); params.set('lon', String(bias.lon)); }
  const res = await fetch(PHOTON + '?' + params.toString(), { signal });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.features ?? []).map(toPlace).filter((p) => !p.skip);
}

// 候補を最大5件（同じ名前・同じ場所はまとめる）
export async function suggestPlaces(title, signal, bias) {
  const qs = placeQueries(title);
  if (!qs.length) return [];
  const lists = await Promise.all(qs.map((q) => photon(q, signal, bias).catch(() => [])));
  const seen = new Set();
  const out = [];
  for (const p of lists.flat()) {
    const key = p.name + '|' + p.where;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out.slice(0, 5);
}

// 地図で開くURL（Googleマップのリンクから入れた場所はそのリンクで、それ以外は名前で検索）
export function mapUrlFor(w) {
  if (w.place?.gmaps) return w.place.gmaps;
  const name = [w.place?.name ?? w.title, w.place?.where ?? w.area].filter(Boolean).join(' ');
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(name);
}
// Googleマップで探す（見つけたら共有→リンクをコピー→アプリに貼る）
export const mapsSearchUrl = (q) => 'https://www.google.com/maps/search/' + encodeURIComponent(String(q || '').trim());

// ---------------------------------------------------------------------
// Googleマップのリンク → 場所
//   長いリンク（…/maps/place/店名/@35.3,139.4,17z/data=…!3d35.30!4d139.47…）はそのまま読む。
//   短いリンク（maps.app.goo.gl/…）はブラウザから行き先を読めないので、Edge Function で開いてもらう。
// ---------------------------------------------------------------------
export function isMapsLink(text) {
  const m = String(text || '').match(/https?:\/\/[^\s]+/);
  if (!m) return null;
  try {
    const u = new URL(m[0]);
    const h = u.hostname;
    if (h === 'maps.app.goo.gl') return u.toString();
    if (h === 'goo.gl' && u.pathname.startsWith('/maps')) return u.toString();
    if (/^maps\.google\./.test(h)) return u.toString();
    if (/(^|\.)google\.[a-z.]+$/.test(h) && (u.pathname.startsWith('/maps') || u.searchParams.has('cid'))) return u.toString();
  } catch { /* URL でない */ }
  return null;
}
export const isShortMapsLink = (url) => /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\//.test(url);

// 長いリンクから名前と位置を読む（純粋な関数。tests.html でテスト）
export function parseMapsUrl(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const out = { name: null, lat: null, lon: null };
  const place = u.pathname.match(/\/maps\/place\/([^/]+)/);
  if (place) out.name = decodeURIComponent(place[1].replace(/\+/g, ' ')).trim();
  const q = u.searchParams.get('q') ?? u.searchParams.get('query');
  if (!out.name && q && !/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(q)) out.name = q.trim();
  const search = !out.name && u.pathname.match(/\/maps\/search\/([^/]+)/);
  if (search) out.name = decodeURIComponent(search[1].replace(/\+/g, ' ')).trim();
  // 位置：お店そのもの（!3d…!4d…）＞ 地図の真ん中（@lat,lon）＞ q=lat,lon
  const exact = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  const at = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  const ll = q && q.match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
  const pick = exact ?? at ?? ll;
  if (pick) { out.lat = Math.round(Number(pick[1]) * 1e5) / 1e5; out.lon = Math.round(Number(pick[2]) * 1e5) / 1e5; }
  if (!out.name && out.lat == null) return null;
  return out;
}
// 「名前 · 住所」の形（ページの og:title）を分ける
export function splitTitle(t) {
  const [name, ...rest] = String(t || '').split(/\s*[·・]\s*/);
  return { name: name?.trim() || null, address: rest.join(' ').trim() || null };
}

// 位置から市区町村・都道府県を出す（Photon の逆引き）
async function whereAt(lat, lon) {
  try {
    const res = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&limit=1`);
    if (!res.ok) return '';
    const p = (await res.json()).features?.[0]?.properties ?? {};
    const city = p.city || p.county || p.district || '';
    return [...new Set([city, p.state].filter(Boolean))].join('・');
  } catch { return ''; }
}

export async function resolveMapsLink(roomId, url) {
  let finalUrl = url;
  let title = null;
  if (isShortMapsLink(url) || !parseMapsUrl(url)) {
    const res = await fetch(SUPABASE_URL + '/functions/v1/matane', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mapsLink', room: roomId, url }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.url) throw new Error(data?.error || 'expand');
    finalUrl = data.url;
    title = data.title;
  }
  const parsed = parseMapsUrl(finalUrl) ?? { name: null, lat: null, lon: null };
  const t = splitTitle(title);
  const name = parsed.name || t.name;
  if (!name) return null;
  const where = parsed.lat != null ? await whereAt(parsed.lat, parsed.lon) : '';
  return { name, where: where || t.address || '', kind: 'Googleマップ', lat: parsed.lat, lon: parsed.lon, gmaps: url };
}
