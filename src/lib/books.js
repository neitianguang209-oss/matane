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

const norm = (s) => String(s || '').normalize('NFKC').toLowerCase().replace(/[\s　]+/g, '');

export async function searchBooks(query) {
  const q = query.trim();
  if (!q) return [];
  const isbn = normalizeIsbn(q);
  let books = [];
  try {
    const items = await fetchNdl(isbn ? { isbn, cnt: 20 } : { any: q, cnt: 30, mediatype: 'books' });
    // 同じ本の複数レコード（紙・電子・点字など）を1冊にまとめる
    const groups = new Map();
    for (const it of items) {
      if (!it.isbn && !it.paper) continue;
      const key = it.isbn || it.title + '|' + it.publisher + '|' + it.year;
      const cur = groups.get(key);
      if (!cur) groups.set(key, it);
      else for (const k of Object.keys(it)) if (!cur[k] || (Array.isArray(cur[k]) && !cur[k].length)) cur[k] = it[k];
    }
    books = [...groups.values()];
  } catch (err) {
    console.warn('NDL search failed', err);
  }
  if (books.length < 3) {
    try {
      const g = await fetchGoogle(isbn ? 'isbn:' + isbn : q);
      const seen = new Set(books.map((b) => b.isbn).filter(Boolean));
      books = books.concat(g.filter((b) => !b.isbn || !seen.has(b.isbn)));
    } catch (err) { console.warn('Google Books failed', err); }
  }
  const nq = norm(q);
  const score = (b) => {
    const t = norm(b.title);
    const m = t === nq ? 0 : t.startsWith(nq) ? 1 : t.includes(nq) ? 2 : norm(b.authors.join('')).includes(nq) ? 2 : 3;
    const foreign = /[ぁ-んァ-ヶ一-龠]/.test(b.publisher + b.title) ? 0 : 4;   // 日本の出版社の本を先に
    const special = /福祉会|点字|大活字|大きな文字|オンデマンド/.test(b.publisher + (b.volume ?? '')) ? 3 : 0;   // 大活字本などは後ろへ
    return m + foreign + special + (b.isbn ? 0 : 1);
  };
  return books
    .filter((b) => b.title)
    .sort((a, b) => score(a) - score(b) || String(b.year).localeCompare(String(a.year)))
    .slice(0, 20);
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
