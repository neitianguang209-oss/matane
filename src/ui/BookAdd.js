// 読書会の本を追加する（タイトル検索 → 選ぶ → 誰が選んだか）
import { html, React } from '../lib/html.js';
import { go } from '../lib/router.js';
import { saveItem, getItem } from '../lib/store.js';
import { searchBooks, findCover } from '../lib/books.js';
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
  const [by, setBy] = useState(null);
  const token = useRef(0);

  useEffect(() => {
    if (!open) return;
    setQ(''); setResults(null); setPicked(null); setManual(false); setBusy(false);
    setBy(nextPicker(snap.books, snap.members) ?? snap.me);
  }, [open]);

  const { queue } = bookQueue(snap.books);
  const slot = queue.length === 0 ? '次回' : queue.length === 1 ? '次々回' : `${queue.length + 1}冊目の予約`;

  async function run() {
    const s = q.trim();
    if (!s) return;
    const my = ++token.current;
    setBusy(true); setPicked(null);
    try {
      const list = await searchBooks(s);
      if (my === token.current) setResults(list);
    } catch {
      if (my === token.current) setResults([]);
    } finally {
      if (my === token.current) setBusy(false);
    }
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

  return html`<${Sheet} open=${open} onClose=${onClose} title=${`${slot}の本を追加`}>
    ${picked ? html`<div class="stack">
      <div class="row" style=${{ gap: '14px', alignItems: 'flex-start' }}>
        <${Cover} book=${{ ...picked, author: (picked.authors ?? []).join('、') }} width=${72} />
        <div class="grow">
          <div class="round bold" style=${{ fontSize: '17px', lineHeight: 1.4 }}>${picked.title}${picked.volume ? ' ' + picked.volume : ''}</div>
          <div class="small muted">${[(picked.authors ?? []).join('、'), picked.publisher, picked.year].filter(Boolean).join(' ／ ')}</div>
          <button class="link-btn" onClick=${() => setPicked(null)}>選びなおす</button>
        </div>
      </div>
      ${chooser}
      <button class="btn book block" onClick=${add}><${Icon} name="plus" />${slot}の本にする</button>
    </div>` : manual ? html`<${ManualForm} onBack=${() => setManual(false)} chooser=${chooser} onDone=${(b) => setPicked(b)} />` : html`<div class="stack">
      <div class="row">
        <div class="input-wrap grow">
          <${Icon} name="search" />
          <input class="input" type="search" enterkeyhint="search" placeholder="タイトル・著者・ISBN" value=${q} autoFocus aria-label="本をさがす"
            onInput=${(e) => setQ(e.target.value)} onKeyDown=${(e) => { if (e.key === 'Enter' && !e.isComposing) run(); }} />
        </div>
        <button class="btn primary" disabled=${!q.trim() || busy} onClick=${run}>${busy ? '検索中…' : '検索'}</button>
      </div>
      ${busy ? html`<div class="empty small" style=${{ padding: '20px' }}>📚 国立国会図書館で さがしています…</div>` : null}
      ${!busy && results?.length ? html`<div>
        ${results.map((b, i) => html`<button key=${i} class="search-result" onClick=${() => setPicked(b)}>
          <${Cover} book=${{ ...b, author: b.authors.join('、') }} width=${42} />
          <span class="grow">
            <span class="t" style=${{ display: 'block' }}>${b.title}${b.volume ? ' ' + b.volume : ''}</span>
            <span class="a">${[b.authors.join('、'), b.publisher, b.year].filter(Boolean).join(' ／ ')}</span>
          </span>
        </button>`)}
      </div>` : results && !busy ? html`<div class="empty small" style=${{ padding: '16px' }}>見つかりませんでした。言葉を短くするか、手入力してください。</div>` : null}
      <button class="btn ghost block small" onClick=${() => setManual(true)}><${Icon} name="edit" />見つからないときは手入力</button>
    </div>`}
  <//>`;
}

function ManualForm({ onBack, onDone }) {
  const [title, setTitle] = useState('');
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
