// 読書会の本を追加する（打つだけで候補 or バーコード → 選ぶ → 誰が選んだか）
import { html, React } from '../lib/html.js';
import { go } from '../lib/router.js';
import { saveItem, getItem } from '../lib/store.js';
import { searchBooks, findCover, normalizeIsbn } from '../lib/books.js';
import { todayStr, fmtDate } from '../lib/dates.js';
import { bookQueue, nextPicker, upcomingPlans, bookForNewClub } from '../lib/logic.js';
import { Icon } from './icons.js';
import { Sheet, Cover, Avatar, toast } from './components.js';

const { useState, useEffect, useRef } = React;

export function BookAddSheet({ open, onClose, snap }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);   // null = まだ検索していない
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState(null);
  const [manual, setManual] = useState(false);
  const [scan, setScan] = useState(false);
  const [by, setBy] = useState(null);
  const token = useRef(0);
  const timer = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setQ(''); setResults(null); setPicked(null); setManual(false); setBusy(false); setScan(false);
    setBy(nextPicker(snap.books, snap.members) ?? snap.me);
  }, [open]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const { queue } = bookQueue(snap.books);
  const slot = queue.length === 0 ? '次回' : queue.length === 1 ? '次々回' : `${queue.length + 1}冊目の予約`;

  async function run(text = q, { autoPick = false } = {}) {
    const s = String(text).trim();
    clearTimeout(timer.current);
    if (!s) { setResults(null); setBusy(false); return; }
    const my = ++token.current;
    setBusy(true);
    try {
      const list = await searchBooks(s);
      if (my !== token.current) return;
      setResults(list);
      if (autoPick && list.length) setPicked(list[0]);
    } catch {
      if (my === token.current) setResults([]);
    } finally {
      if (my === token.current) setBusy(false);
    }
  }
  // 打つのが止まったら自動で探す（2文字から。iPhone の変換中のひらがなでも探す）
  function onType(v) {
    setQ(v);
    clearTimeout(timer.current);
    const s = v.trim();
    if (s.length < 2 && !normalizeIsbn(s)) return;
    timer.current = setTimeout(() => run(v), 650);
  }

  function add() {
    if (!picked?.title?.trim()) return;
    const order = Math.max(0, ...snap.books.map((b) => b.order ?? 0)) + 1;
    const saved = saveItem(snap.id, {
      kind: 'book',
      title: picked.title.trim() + (picked.volume ? ' ' + picked.volume : ''),
      author: (picked.authors ?? []).join('、') || picked.author?.trim() || null,
      publisher: picked.publisher || null,
      year: picked.year || null,
      isbn: picked.isbn || null,
      cover: picked.cover || null,
      pages: picked.pages || null,
      pickedBy: by,
      order,
    });
    // 本がまだ決まっていない「これからの読書会の日」があれば、その日に割り当てる
    // （先に予約されている本が日にちを待っているなら、そちらが先）
    const today = todayStr();
    const waiting = upcomingPlans(snap.plans, today).find((p) => p.bookClub && !p.bookId);
    if (waiting && bookForNewClub([...snap.books, saved], snap.plans, today)?.id === saved.id) {
      saveItem(snap.id, { ...waiting, bookId: saved.id });
      toast(`『${saved.title}』を${fmtDate(waiting.date)}の読書会に入れたよ`);
    } else {
      toast(`『${saved.title}』を${slot}の本にしたよ`, { action: '見る', onAction: () => go(`/r/${snap.id}/b/${saved.id}`) });
    }
    // 表示できるいちばんきれいな表紙を探して覚えておく（裏で）
    findCover(saved).then((url) => {
      const cur = getItem(snap.id, saved.id);
      if (url && cur && !cur.deleted && cur.cover !== url) saveItem(snap.id, { ...cur, cover: url });
    }).catch(() => {});
    onClose();
  }

  const chooser = html`<div class="field">
    <span class="label">だれが選んだ本？</span>
    <div class="row">
      ${snap.members.map((m) => html`<button key=${m.id} type="button" class=${'chip grow' + (by === m.id ? ' on' : '')} aria-pressed=${by === m.id}
        style=${{ justifyContent: 'center', minHeight: '44px' }} onClick=${() => setBy(m.id)}>
        <${Avatar} m=${m} size="xs" />${m.name}${m.id === snap.me ? '（あなた）' : ''}
      </button>`)}
    </div>
  </div>`;

  let body;
  if (picked) {
    body = html`<div class="stack">
      <div class="row" style=${{ gap: '14px', alignItems: 'flex-start' }}>
        <${Cover} book=${{ ...picked, author: (picked.authors ?? []).join('、') }} width=${80} />
        <div class="grow">
          <div class="round bold" style=${{ fontSize: '18px', lineHeight: 1.4 }}>${picked.title}${picked.volume ? ' ' + picked.volume : ''}</div>
          <div class="small muted">${[(picked.authors ?? []).join('、'), picked.publisher, picked.year].filter(Boolean).join(' ／ ')}</div>
          <button class="link-btn" onClick=${() => setPicked(null)}>選びなおす</button>
        </div>
      </div>
      ${chooser}
      <button class="btn book block" onClick=${add}><${Icon} name="plus" />${slot}の本にする</button>
    </div>`;
  } else if (manual) {
    body = html`<${ManualForm} onBack=${() => setManual(false)} initial=${q} onDone=${(b) => setPicked(b)} />`;
  } else {
    body = html`<div class="stack">
      <div class="row">
        <div class="input-wrap grow">
          <${Icon} name="search" />
          <input ref=${inputRef} class="input" type="search" enterkeyhint="search" placeholder="タイトル・著者（どちらか一部でもOK）" value=${q} autoFocus aria-label="本をさがす"
            onInput=${(e) => onType(e.target.value)}
            onKeyDown=${(e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); run(); e.target.blur(); } }} />
          ${q ? html`<button class="clear" aria-label="消す" onClick=${() => { setQ(''); setResults(null); token.current++; setBusy(false); inputRef.current?.focus(); }}><${Icon} name="close" size=${18} /></button>` : null}
        </div>
        <button class="btn soft" style=${{ padding: '0 12px' }} onClick=${() => setScan(true)} aria-label="バーコードで読み取る">
          <${Icon} name="barcode" />
        </button>
      </div>
      <div class="tiny faint" style=${{ marginTop: '-4px', paddingLeft: '4px' }}>例）「コンビニ人間」「村田沙耶香」「村上 ノルウェイ」・本の裏のバーコードでも</div>
      ${busy ? html`<div class="search-busy"><span class="dot"></span>さがしています…（国立国会図書館・Google ブックス）</div>` : null}
      ${results?.length ? html`<div style=${busy ? { opacity: 0.55 } : null}>
        ${results.map((b, i) => html`<button key=${(b.isbn ?? '') + i} class="search-result" onClick=${() => setPicked(b)}>
          <${Cover} book=${{ ...b, author: b.authors.join('、') }} width=${42} />
          <span class="grow">
            <span class="t" style=${{ display: 'block' }}>${b.title}${b.volume ? ' ' + b.volume : ''}</span>
            <span class="a">${[b.authors.join('、'), b.publisher + (b.series ? `（${b.series}）` : ''), b.year].filter(Boolean).join(' ／ ')}</span>
          </span>
        </button>`)}
      </div>` : results && !busy ? html`<div class="empty small" style=${{ padding: '16px' }}>見つかりませんでした。<br />言葉を短くするか、著者名でも試してみてください。</div>` : null}
      <button class="btn ghost block small" onClick=${() => setManual(true)}><${Icon} name="edit" />見つからないときは手入力</button>
    </div>`;
  }

  return html`<${Sheet} open=${open} onClose=${onClose} title=${`${slot}の本を追加`} tall=${!picked}>
    ${body}
    ${scan ? html`<${BarcodeScanner} onClose=${() => setScan(false)}
      onIsbn=${(isbn) => { setScan(false); setQ(isbn); run(isbn, { autoPick: true }); }} />` : null}
  <//>`;
}

function ManualForm({ onBack, onDone, initial }) {
  const [title, setTitle] = useState(normalizeIsbn(initial) ? '' : initial ?? '');
  const [author, setAuthor] = useState('');
  return html`<div class="stack">
    <div class="field"><label for="bt">タイトル</label><input id="bt" class="input" value=${title} autoFocus onInput=${(e) => setTitle(e.target.value)} /></div>
    <div class="field"><label for="ba">著者 <span class="opt">任意</span></label><input id="ba" class="input" value=${author} onInput=${(e) => setAuthor(e.target.value)} /></div>
    <div class="row">
      <button class="btn grow" onClick=${onBack}>検索にもどる</button>
      <button class="btn primary grow" disabled=${!title.trim()} onClick=${() => onDone({ title: title.trim(), authors: author.trim() ? [author.trim()] : [], publisher: '', year: '' })}>次へ</button>
    </div>
  </div>`;
}

// ---------------------------------------------------------------------
// バーコード読み取り（読書記録アプリと同じ html5-qrcode。初めて使うときだけ読み込む）
// ---------------------------------------------------------------------
const SCAN_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js';
let scanLib = null;
function loadScanLib() {
  if (window.Html5Qrcode) return Promise.resolve();
  if (!scanLib) {
    scanLib = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SCAN_LIB;
      s.onload = resolve;
      s.onerror = () => { scanLib = null; reject(new Error('load')); };
      document.head.appendChild(s);
    });
  }
  return scanLib;
}

function BarcodeScanner({ onClose, onIsbn }) {
  const [note, setNote] = useState('カメラを起動しています…');
  const done = useRef(false);
  useEffect(() => {
    let scanner = null;
    let alive = true;
    (async () => {
      try { await loadScanLib(); } catch {
        setNote('読み取り機能を読み込めませんでした。電波を確かめるか、タイトルで探してください。');
        return;
      }
      if (!alive) return;
      try {
        scanner = new window.Html5Qrcode('matane-scan', { formatsToSupport: [window.Html5QrcodeSupportedFormats.EAN_13], verbose: false });
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: (w, h) => ({ width: Math.floor(w * 0.85), height: Math.max(60, Math.floor(Math.min(w, h) * 0.4)) }) },
          (text) => {
            if (done.current) return;
            const isbn = /^97[89]/.test(text) ? normalizeIsbn(text) : null;
            if (!isbn) { setNote('上の段のバーコード（978から始まる方）を映してください。'); return; }
            done.current = true;
            onIsbn(isbn);
          },
          () => {},
        );
        if (alive) setNote('本の裏の「978」から始まるバーコードを枠に合わせてください。');
      } catch {
        if (alive) setNote('カメラを使えませんでした。カメラの利用を許可するか、タイトルで探してください。');
      }
    })();
    return () => {
      alive = false;
      const s = scanner;
      if (s) (async () => { try { if (s.isScanning) await s.stop(); s.clear(); } catch { /* 無視 */ } })();
    };
  }, []);
  return html`<div class="scan-overlay" role="dialog" aria-modal="true" aria-label="バーコードを読み取る">
    <div class="scan-box">
      <div class="row between" style=${{ marginBottom: '10px' }}>
        <span class="round bold" style=${{ fontSize: '17px', color: '#fff' }}>バーコードで探す</span>
        <button class="icon-btn" style=${{ color: '#fff' }} aria-label="閉じる" onClick=${onClose}><${Icon} name="close" /></button>
      </div>
      <div id="matane-scan" class="scan-view"></div>
      <div class="small" style=${{ color: 'rgba(255,255,255,.85)', marginTop: '12px', lineHeight: 1.7 }}>${note}</div>
    </div>
  </div>`;
}
