// 本の検索（読書記録アプリと同じ情報源）。どれもキー不要でブラウザから直接呼べる。
//   国立国会図書館サーチ（日本の本に強い）→ 見つからなければ Google Books
// 表紙は 版元ドットコム → Amazon → Google Books → 国会図書館 の順に、実際に表示できるものを使う。

const NDL = 'https://ndlsearch.ndl.go.jp/api/opensearch';
const NS = {
  dc: 'http://purl.org/dc/elements/1.1/',
  dcndl: 'http://ndl.go.jp/dcndl/terms/',
  xsi: 'http://www.w3.org/2001/XMLSchema-instance',
};

function isbn10to13(s) {
  const core = '978' + s.slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(core[i]) * (i % 2 ? 3 : 1);
  return core + ((10 - (sum % 10)) % 10);
}
export function normalizeIsbn(raw) {
  const s = String(raw || '').replace(/[^0-9Xx]/g, '').toUpperCase();
  if (/^97[89]\d{10}$/.test(s)) return s;
  if (/^\d{9}[\dX]$/.test(s)) return isbn10to13(s);
  return null;
}
function isbn13to10(isbn) {
  const core = isbn.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(core[i]) * (10 - i);
  const check = (11 - (sum % 11)) % 11;
  return core + (check === 10 ? 'X' : check);
}

// 「嫌われる勇気 : 自己啓発の源流…」の副題は外す
const cleanTitle = (t) => String(t || '').split(/\s+:\s+/)[0].trim();
// NDLの「岸見, 一郎, 1956-」を「岸見一郎」に
function cleanCreator(raw) {
  const parts = String(raw || '').split(/\s*,\s*/).filter((p) => p && !/^\d{3,4}-?(\d{3,4})?$/.test(p));
  if (parts.length < 2) return (parts[0] || '').replace(/[\s　]+/g, '');
  const [family, given] = parts;
  if (/[一-鿿぀-ゟ]/.test(family + given)) return (family + given).replace(/[\s　]+/g, '');
  if (/[゠-ヿ]/.test(family)) return given + '・' + family;
  return given + ' ' + family;
}
export function cleanPublisher(p) {
  const s = String(p || '').replace(/株式会社|有限会社|（株）|\(株\)/g, '').trim();
  return s.replace(/[\s　]*出版(社|部|局)?$/, '') || s;
}

async function fetchNdl(params) {
  const res = await fetch(NDL + '?' + new URLSearchParams(params).toString());
  if (!res.ok) throw new Error('NDL ' + res.status);
  const xml = new DOMParser().parseFromString(await res.text(), 'application/xml');
  return Array.from(xml.getElementsByTagName('item')).map((item) => {
    const all = (ns, tag) => Array.from(item.getElementsByTagNameNS(NS[ns], tag));
    const text = (ns, tag) => all(ns, tag)[0]?.textContent.trim() ?? '';
    const ids = all('dc', 'identifier');
    const typed = (type) => ids.find((x) => x.getAttributeNS(NS.xsi, 'type') === type)?.textContent.trim() ?? '';
    const kinds = Array.from(item.getElementsByTagName('category')).map((c) => c.textContent.trim());
    return {
      title: cleanTitle(text('dc', 'title')),
      volume: text('dcndl', 'volume'),
      authors: all('dc', 'creator').map((n) => cleanCreator(n.textContent)).filter(Boolean),
      publisher: cleanPublisher(text('dc', 'publisher')),
      series: text('dcndl', 'seriesTitle').replace(/\s*;\s*[\d\-ー]+.*$/, ''),
      year: text('dc', 'date').slice(0, 4),
      isbn: normalizeIsbn(typed('dcndl:ISBN13') || typed('dcndl:ISBN')),
      paper: kinds.includes('紙'),
    };
  });
}

async function fetchGoogle(q) {
  const params = new URLSearchParams({ q, maxResults: '20', printType: 'books' });
  const res = await fetch('https://www.googleapis.com/books/v1/volumes?' + params.toString());
  if (!res.ok) return [];
  const data = await res.json();
  return (data.items || []).map((v) => {
    const info = v.volumeInfo || {};
    const ids = info.industryIdentifiers || [];
    const id = ids.find((x) => x.type === 'ISBN_13') || ids.find((x) => x.type === 'ISBN_10') || {};
    const thumb = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail;
    return {
      title: info.title || '',
      volume: '',
      authors: info.authors || [],
      publisher: cleanPublisher(info.publisher || ''),
      year: String(info.publishedDate || '').slice(0, 4),
      cover: thumb ? thumb.replace(/^http:/, 'https:').replace('&edge=curl', '') : '',
      isbn: normalizeIsbn(id.identifier),
      pages: info.pageCount || null,
    };
  }).filter((b) => b.title);
}

// ---------------------------------------------------------------------
// あいまい検索
//   国会図書館は「関連の高い順」に並べてくれない（五十音順で上限まで）ので、
//   タイトル・著者・タイトル＋著者の組み合わせを同時に引き、Google Books（関連順）も足して、
//   こちらで「どれだけ言葉が合っているか」で並べ直す。
//   ひらがなで打ったときはカタカナでも探す（「のるうぇい」→「ノルウェイ」）。
// ---------------------------------------------------------------------
export const toKatakana = (s) => String(s).replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
// 比べるための形：全角半角・大文字小文字・カタカナ/ひらがな・記号の違いを無くす
export function foldText(s) {
  return String(s || '').normalize('NFKC').toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s　・:：、,.。!！?？「」『』()（）\[\]［］〈〉《》"'“”‘’\-‐–—~〜]/g, '');
}
export function splitWords(q) {
  return String(q || '').normalize('NFKC').split(/[\s　]+/).map((w) => w.trim()).filter(Boolean);
}

// 検索結果1件の「合い方」（小さいほど上）
export function bookScore(b, query) {
  const words = splitWords(query).map(foldText).filter(Boolean);
  const whole = foldText(query);
  const t = foldText(b.title);
  const tv = foldText(b.title + (b.volume ?? ''));
  const a = foldText((b.authors ?? []).join(''));
  const vol = /^[上中下\d一二三四五六七八九十]|巻|^第/.test(String(b.volume ?? '').normalize('NFKC').trim());   // 「上」「1」などの巻だけ
  let m;
  // 上・中・下、1・2…の順に並ぶように少しだけ差をつける
  const vs = String(b.volume ?? '').normalize('NFKC').trim();
  const volOrder = vol ? ({ 上: 1, 中: 2, 下: 3 }[vs[0]] ?? Math.min(9, parseInt(vs, 10) || 5)) * 0.01 : 0;
  if (t === whole || tv === whole) m = (vol ? 0.2 : 0) + volOrder;          // そのまま（上・下巻も本編として）
  else if (words.length > 1 && words.every((w) => t.includes(w) || a.includes(w))) {
    // 「村上 ノルウェイ」：著者とタイトルに分けて当たる本（＝その作家のその本）がいちばん
    const inTitle = words.filter((w) => t.includes(w));
    const inAuthor = words.filter((w) => !t.includes(w) && a.includes(w));
    const extra = Math.min(0.4, Math.max(0, t.length - inTitle.join('').length) * 0.03);   // タイトルが短いほど本そのもの
    if (inTitle.length && inAuthor.length) m = (t.startsWith(inTitle[0]) ? 0.5 : 1.2) + extra;
    else if (inTitle.length === words.length) m = t.startsWith(words[0]) ? 1.5 : 2.2;
    else m = 2.5;
  }
  else if (t.startsWith(whole)) m = 1;
  else if (t.includes(whole)) m = 2;
  else if (a.includes(whole)) m = 2.5;
  else if (words.some((w) => t.includes(w) || a.includes(w))) m = 5;
  else m = 8;
  const foreign = /[ぁ-んァ-ヶ一-龠]/.test(b.publisher + b.title) ? 0 : 4;   // 日本の出版社の本を先に
  const otherScript = /[Ѐ-ӿ가-힯฀-๿]|語版|〔.*[A-Za-z].*〕/.test(b.title + (b.volume ?? '')) ? 4 : 0;   // ロシア語・韓国語などの版
  const special = /福祉会|点字|大活字|大きな文字|オンデマンド|朗読|音訳|オーディオ|パンフレット/.test(b.publisher + (b.volume ?? '') + b.title + (b.series ?? '')) ? 3 : 0;   // 大活字本などは後ろへ
  const format = /文庫/.test(b.series ?? '') ? -0.3 : /コミック|まんが|マンガ/.test((b.series ?? '') + b.title) ? 0.6 : 0;   // 読書会は文庫が多い
  const handmade = /手製|図書館/.test(b.publisher) ? 5 : 0;                  // 図書館が作った複製
  const translated = /^\[.*\]$/.test(String(b.title).trim()) || /^\[.*\]$/.test(String(b.publisher).trim()) ? 4 : 0;   // 海外の版（目録が[ ]で読みを補っている）
  return m + foreign + otherScript + special + format + handmade + translated + (b.isbn ? 0 : 1) + (b.publisher ? 0 : 1) + (b.rank ?? 0);
}

function withTimeout(p, ms = 9000) {
  return Promise.race([p, new Promise((resolve) => setTimeout(() => resolve([]), ms))]);
}
const safe = (p) => withTimeout(p).catch((err) => { console.warn('book search', err); return []; });

export async function searchBooks(query) {
  const q = String(query || '').trim();
  if (!q) return [];
  const isbn = normalizeIsbn(q);
  const NDL = (params) => safe(fetchNdl({ cnt: 40, mediatype: 'books', ...params }));
  const jobs = [];
  if (isbn) {
    jobs.push(NDL({ isbn, cnt: 20 }), safe(fetchGoogle('isbn:' + isbn)));
  } else {
    const words = splitWords(q);
    jobs.push(NDL({ title: q, cnt: 100 }));
    if (words.length === 1) jobs.push(NDL({ creator: q, cnt: 30 }));
    else {
      // 「村上春樹 ノルウェイ」「ノルウェイ 村上」のどちらの順でも当たるように
      jobs.push(NDL({ creator: words[0], title: words.slice(1).join(' '), cnt: 30 }));
      jobs.push(NDL({ creator: words[words.length - 1], title: words.slice(0, -1).join(' '), cnt: 30 }));
    }
    if (/[ぁ-ゖ]/.test(q) && !/[一-龠ァ-ヶ]/.test(q)) jobs.push(NDL({ title: toKatakana(q) }));
    jobs.push(safe(fetchGoogle(q)).then((list) => list.map((b, i) => ({ ...b, rank: i * 0.04 }))));
  }
  const lists = await Promise.all(jobs);

  // 同じ本の複数レコード（紙・電子・点字、国会図書館とGoogleの重なり）を1冊にまとめる
  const groups = new Map();
  for (const it of lists.flat()) {
    if (!it?.title) continue;
    if (it.paper === false && !it.isbn) continue;   // 点字・音声版だけのレコードは出さない
    const key = it.isbn || foldText(it.title + (it.volume ?? '')) + '|' + foldText(it.publisher) + '|' + it.year;
    const cur = groups.get(key);
    if (!cur) { groups.set(key, { ...it }); continue; }
    for (const k of Object.keys(it)) {
      if (k === 'rank') cur.rank = Math.min(cur.rank ?? 9, it.rank ?? 9);
      else if (!cur[k] || (Array.isArray(cur[k]) && !cur[k].length)) cur[k] = it[k];
    }
  }
  // ISBN の無い古い目録が、ISBN つきの同じ版と重なっていたら外す
  const withIsbn = new Set([...groups.values()].filter((b) => b.isbn).map((b) => foldText(b.title + (b.volume ?? '')) + '|' + foldText(b.publisher) + '|' + b.year));
  for (const [k, b] of groups) {
    if (!b.isbn && withIsbn.has(foldText(b.title + (b.volume ?? '')) + '|' + foldText(b.publisher) + '|' + b.year)) groups.delete(k);
  }
  return [...groups.values()]
    .map((b) => ({ ...b, rank: b.rank ?? 0.6, _s: 0 }))
    .map((b) => ({ ...b, _s: bookScore(b, q) }))
    .sort((a, b) => a._s - b._s || String(b.year).localeCompare(String(a.year)))
    .slice(0, 24)
    .map(({ _s, rank, ...b }) => b);
}

// 表紙の候補URL（順に試す）
export function coverCandidates(book) {
  const list = [];
  if (book?.cover) list.push(book.cover);
  if (book?.isbn) {
    list.push('https://img.hanmoto.com/bd/img/' + book.isbn + '.jpg');
    if (book.isbn.startsWith('978')) list.push('https://m.media-amazon.com/images/P/' + isbn13to10(book.isbn) + '.09.LZZZZZZZ.jpg');
    list.push('https://ndlsearch.ndl.go.jp/thumbnail/' + book.isbn + '.jpg');
  }
  return [...new Set(list)];
}

// 実際に表示できる表紙を1つ探す（Amazon は画像が無いと 1×1 の透明画像を返すので幅で弾く）
export function imageLoads(url, timeout = 6000) {
  return new Promise((resolve) => {
    const img = new Image();
    const t = setTimeout(() => resolve(false), timeout);
    img.onload = () => { clearTimeout(t); resolve(img.naturalWidth > 10); };
    img.onerror = () => { clearTimeout(t); resolve(false); };
    img.referrerPolicy = 'no-referrer';
    img.src = url;
  });
}
export async function findCover(book) {
  // 検索結果の画像は小さいことが多いので、ISBN があれば版元・Amazon を先に試す
  const list = coverCandidates({ ...book, cover: null });
  if (book.cover) list.splice(2, 0, book.cover);
  for (const url of list) if (await imageLoads(url)) return url;
  return null;
}

export const calilUrl = (b) => 'https://calil.jp/search?q=' + encodeURIComponent([b.title, b.author].filter(Boolean).join(' '));
export const amazonUrl = (b) => b.isbn
  ? 'https://www.amazon.co.jp/dp/' + (b.isbn.startsWith('978') ? isbn13to10(b.isbn) : b.isbn)
  : 'https://www.amazon.co.jp/s?k=' + encodeURIComponent([b.title, b.author].filter(Boolean).join(' ')) + '&i=stripbooks';
