import { html, React } from '../lib/html.js';
import { back, go } from '../lib/router.js';
import { saveItem, deleteItem, getItem } from '../lib/store.js';
import { noteId } from '../lib/ids.js';
import { fmtDate, todayStr } from '../lib/dates.js';
import { bookQueue, planForBook, nextPicker } from '../lib/logic.js';
import { calilUrl, amazonUrl } from '../lib/books.js';
import { useRoom, useToday } from './hooks.js';
import { Icon } from './icons.js';
import { TopBar, Cover, Avatar, Sheet, toast, confirmDialog, memberColor } from './components.js';
import { noteOf } from './HomeTab.js';

const { useState, useEffect, useRef } = React;
const STEPS = [[0, 'まだ'], [25, '少し'], [50, '半分'], [75, 'もう少し'], [100, '読了']];

export function BookPage({ roomId, id }) {
  const { snap } = useRoom(roomId);
  const today = useToday();
  const [editOpen, setEditOpen] = useState(false);
  const b = snap.bookById.get(id);
  if (!b) {
    return html`<div class="page no-nav"><${TopBar} title="読書会" onBack=${() => back(`/r/${roomId}/book`)} />
      <div class="empty"><div class="e">🫥</div><div class="t">見つかりませんでした</div></div></div>`;
  }
  const q = bookQueue(snap.books);
  const plan = planForBook(snap.plans, b.id, today);
  const picker = snap.memberById.get(b.pickedBy);
  const pos = q.queue.indexOf(b);
  const status = b.doneAt ? `${fmtDate(b.doneAt)}に語った本` : pos === 0 ? '次回の本' : pos === 1 ? '次々回の本' : 'その先の本';
  const ordered = [...snap.members].sort((a, c) => (a.id === snap.me ? -1 : c.id === snap.me ? 1 : 0));

  function finish() {
    const d = plan && plan.date <= today ? plan.date : todayStr();
    saveItem(roomId, { ...b, doneAt: d });
    const rest = q.queue.filter((x) => x.id !== b.id).length;
    if (rest < 2) {
      const p = snap.memberById.get(nextPicker(snap.books, snap.members));
      toast(`おつかれさま！次々回の本を決めよう${p ? `（${p.name}の番）` : ''}`, { action: '本を選ぶ', onAction: () => go(`/r/${roomId}/book?add=1`), duration: 7000 });
    } else toast('おつかれさま！これまでの本に入れたよ');
  }
  async function remove() {
    if (!(await confirmDialog({ title: `『${b.title}』を消しますか？`, body: 'メモは残りますが、本の一覧からは消えます。', ok: '消す', danger: true }))) return;
    const undo = deleteItem(roomId, b.id);
    toast('消しました', { action: '元に戻す', onAction: undo });
    go(`/r/${roomId}/book`, { replace: true });
  }

  return html`<div class="page no-nav">
    <${TopBar} title="" onBack=${() => back(`/r/${roomId}/book`)}>
      <button class="icon-btn" aria-label="編集" onClick=${() => setEditOpen(true)}><${Icon} name="edit" /></button>
    <//>

    <div class="book-hero">
      <${Cover} book=${b} width=${124} />
      <div class="bt">${b.title}</div>
      <div class="ba">${[b.author, b.publisher, b.year].filter(Boolean).join(' ／ ')}</div>
      <div class="row wrap" style=${{ gap: '6px', justifyContent: 'center', marginTop: '10px' }}>
        <span class="badge book">第${q.no.get(b.id)}回・${status}</span>
        ${picker ? html`<span class="badge"><${Avatar} m=${picker} size="xs" />${picker.name}が選んだ本</span>` : null}
      </div>
    </div>

    ${!b.doneAt ? html`<div style=${{ marginTop: '16px' }}>
      ${plan && plan.date >= today
        ? html`<button class="card" onClick=${() => go(`/r/${roomId}/p/${plan.id}`)} style=${{ background: 'var(--book-soft)', borderColor: 'var(--book-soft-2)', boxShadow: 'none' }}>
            <div class="row"><${Icon} name="calendar" /><div class="grow bold">${fmtDate(plan.date)}${plan.time ? ' ' + plan.time : ''}に語る</div><${Icon} name="chevronRight" size=${18} /></div>
          </button>`
        : html`<button class="btn book block" onClick=${() => go(`/r/${roomId}/p/new?club=1&book=${b.id}`)}><${Icon} name="calendarPlus" />この本を語る日を決める</button>`}
    </div>` : null}

    <h2 class="section">読み進みと、語りたいこと</h2>
    ${ordered.map((m) => m.id === snap.me
      ? html`<${MyNote} key=${m.id} snap=${snap} b=${b} m=${m} />`
      : html`<${TheirNote} key=${m.id} snap=${snap} b=${b} m=${m} />`)}

    <div class="list" style=${{ marginTop: '16px' }}>
      <a class="list-item" href=${calilUrl(b)} target="_blank" rel="noopener noreferrer">
        <${Icon} name="search" /><div class="grow"><div class="bold">図書館でさがす</div><div class="tiny muted">カーリル（近くの図書館の貸し出し状況）</div></div><${Icon} name="external" size=${18} />
      </a>
      <a class="list-item" href=${amazonUrl(b)} target="_blank" rel="noopener noreferrer">
        <${Icon} name="book" /><div class="grow"><div class="bold">Amazonで見る</div></div><${Icon} name="external" size=${18} />
      </a>
    </div>

    <div class="stack" style=${{ marginTop: '18px' }}>
      ${b.doneAt
        ? html`<button class="btn ghost block small" onClick=${() => { saveItem(roomId, { ...b, doneAt: null }); toast('まだ語っていない本に戻したよ'); }}>まだ語っていないことにする</button>`
        : html`<button class="btn block" onClick=${finish}><${Icon} name="checkCircle" />読書会おわった！</button>`}
      <button class="btn ghost danger block small" onClick=${remove}><${Icon} name="trash" />この本を消す</button>
    </div>

    <${BookEditSheet} open=${editOpen} onClose=${() => setEditOpen(false)} snap=${snap} b=${b} />
  </div>`;
}

function MyNote({ snap, b, m }) {
  const note = noteOf(snap, b.id, m.id);
  const [text, setText] = useState(note?.text ?? '');
  const timer = useRef(null);
  const latest = useRef(text);
  // 相手の端末から自分のメモが更新されることは無いが、別の自分の端末で書いたぶんは反映する
  useEffect(() => { if (document.activeElement?.id !== 'mynote') setText(note?.text ?? ''); }, [note?.text]);

  function save(patch) {
    const cur = getItem(snap.id, noteId(b.id, m.id));
    saveItem(snap.id, { ...(cur ?? {}), kind: 'note', id: noteId(b.id, m.id), bookId: b.id, memberId: m.id, deleted: false, ...patch });
  }
  function onText(v) {
    setText(v);
    latest.current = v;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => save({ text: latest.current }), 700);
  }
  useEffect(() => () => {
    if (timer.current) { clearTimeout(timer.current); save({ text: latest.current }); }
  }, []);
  const prog = note?.progress ?? 0;
  return html`<div class="note-card" style=${{ borderColor: memberColor(m) + '55' }}>
    <div class="who"><${Avatar} m=${m} size="sm" />${m.name}（あなた）<span class="grow"></span>
      <span class="num small bold" style=${{ color: 'var(--book)' }}>${prog >= 100 ? '読了 🎉' : prog + '%'}</span></div>
    <input type="range" min="0" max="100" step="5" value=${prog} aria-label="読み進み" style=${{ marginTop: '10px' }}
      onInput=${(e) => save({ progress: Number(e.target.value) })} />
    <div class="quick-prog">
      ${STEPS.map(([v, l]) => html`<button key=${v} class=${prog === v ? 'on' : ''} onClick=${() => save({ progress: v })}>${l}</button>`)}
    </div>
    <textarea id="mynote" class="input" rows="4" value=${text} placeholder="語りたいこと、気になった一文、ページ数など"
      onInput=${(e) => onText(e.target.value)} onBlur=${() => { if (timer.current) { clearTimeout(timer.current); timer.current = null; save({ text: latest.current }); } }}></textarea>
    <div class="tiny faint" style=${{ marginTop: '4px', textAlign: 'right' }}>自動で保存・相手にも見えます</div>
  </div>`;
}

function TheirNote({ snap, b, m }) {
  const note = noteOf(snap, b.id, m.id);
  const prog = note?.progress ?? 0;
  return html`<div class="note-card">
    <div class="who"><${Avatar} m=${m} size="sm" />${m.name}<span class="grow"></span>
      <span class="num small bold" style=${{ color: 'var(--book)' }}>${prog >= 100 ? '読了 🎉' : prog + '%'}</span></div>
    <div class="progress" style=${{ gridTemplateColumns: 'minmax(0, 1fr)', marginTop: '10px' }}>
      <div class="bar"><i style=${{ width: prog + '%', '--c': memberColor(m) }}></i></div>
    </div>
    ${note?.text ? html`<div class="body pre">${note.text}</div>` : html`<div class="small faint" style=${{ marginTop: '8px' }}>まだメモはありません</div>`}
  </div>`;
}

function BookEditSheet({ open, onClose, snap, b }) {
  const [v, setV] = useState(b);
  useEffect(() => { if (open) setV(b); }, [open]);
  if (!open) return null;
  return html`<${Sheet} open=${open} onClose=${onClose} title="本の情報">
    <div class="stack">
      <div class="field"><label for="et">タイトル</label><input id="et" class="input" value=${v.title} onInput=${(e) => setV({ ...v, title: e.target.value })} /></div>
      <div class="field"><label for="ea">著者</label><input id="ea" class="input" value=${v.author ?? ''} onInput=${(e) => setV({ ...v, author: e.target.value })} /></div>
      <div class="field"><span class="label">だれが選んだ本？</span>
        <div class="row">${snap.members.map((m) => html`<button key=${m.id} class=${'chip grow' + (v.pickedBy === m.id ? ' on' : '')} style=${{ justifyContent: 'center' }}
          onClick=${() => setV({ ...v, pickedBy: m.id })}><${Avatar} m=${m} size="xs" />${m.name}</button>`)}</div>
      </div>
      <div class="field"><label for="ec">表紙の画像URL <span class="opt">任意</span></label>
        <input id="ec" class="input" value=${v.cover ?? ''} placeholder="https://…" onInput=${(e) => setV({ ...v, cover: e.target.value })} /></div>
      <button class="btn primary block" disabled=${!v.title?.trim()} onClick=${() => {
        saveItem(snap.id, { ...b, title: v.title.trim(), author: v.author?.trim() || null, pickedBy: v.pickedBy, cover: v.cover?.trim() || null });
        toast('保存したよ');
        onClose();
      }}>保存</button>
    </div>
  <//>`;
}
