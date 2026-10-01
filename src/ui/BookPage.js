import { html, React } from '../lib/html.js';
import { back, go } from '../lib/router.js';
import { saveItem, deleteItem, getItem } from '../lib/store.js';
import { noteId } from '../lib/ids.js';
import { fmtDate, todayStr } from '../lib/dates.js';
import { bookQueue, planForBook, nextPicker, planEnd } from '../lib/logic.js';
import { calilUrl, amazonUrl } from '../lib/books.js';
import { useRoom, useToday } from './hooks.js';
import { Icon } from './icons.js';
import { TopBar, Cover, Avatar, Sheet, Seg, toast, confirmDialog, memberColor, celebrate, copyText } from './components.js';

const { useState, useEffect, useRef } = React;

// 読書記録アプリの付箋と同じ感情タグ
export const EMOTIONS = ['共感', '気づき', '違和感', '感動', '疑問', '学び'];

export function noteOf(snap, bookId, memberId) {
  return snap.notes.find((n) => n.id === noteId(bookId, memberId)) ?? null;
}
export const memosOf = (snap, bookId) => snap.memos.filter((m) => m.bookId === bookId);

// 本のカードに出す「準備のようす」：語りたいことを書いたか・付箋の数
export function BookPrep({ snap, b, dark = false }) {
  const memos = memosOf(snap, b.id);
  const talks = memos.filter((m) => m.type === 'talk').length;
  return html`<span class=${'prep' + (dark ? ' dark' : '')}>
    ${snap.members.map((m) => {
      const ok = !!noteOf(snap, b.id, m.id)?.text?.trim();
      return html`<span key=${m.id} class=${'prep-who' + (ok ? ' ok' : '')} title=${ok ? `${m.name}：語りたいことあり` : `${m.name}：まだ`}>
        <${Avatar} m=${m} size="xs" />${ok ? html`<${Icon} name="check" size=${12} stroke=${3} />` : null}
      </span>`;
    })}
    ${memos.length - talks ? html`<span class="prep-n"><${Icon} name="quote" size=${12} />付箋 ${memos.length - talks}</span>` : null}
    ${talks ? html`<span class="prep-n"><${Icon} name="star" size=${12} />響いた話 ${talks}</span>` : null}
  </span>`;
}

export function BookPage({ roomId, id, query }) {
  const { snap } = useRoom(roomId);
  const today = useToday();
  const [editOpen, setEditOpen] = useState(false);
  const [memo, setMemo] = useState(null);   // 書いている付箋（新規は {type} だけ）
  const [filter, setFilter] = useState('all');
  const b = snap.bookById.get(id);

  // 「響いた話をメモ」から来たときは、すぐ書けるように開く
  useEffect(() => {
    if (b && query?.talk === '1') {
      setMemo({ type: 'talk' });
      go(`/r/${roomId}/b/${id}`, { replace: true });
    }
  }, [query?.talk]);

  if (!b) {
    return html`<div class="page no-nav"><${TopBar} title="読書会" onBack=${() => back(`/r/${roomId}/book`)} />
      <div class="empty"><div class="e">🫥</div><div class="t">見つかりませんでした</div></div></div>`;
  }
  const q = bookQueue(snap.books);
  const plan = planForBook(snap.plans, b.id, today);
  const isToday = plan && plan.date <= today && planEnd(plan) >= today;
  const picker = snap.memberById.get(b.pickedBy);
  const pos = q.queue.indexOf(b);
  const status = b.doneAt ? `${fmtDate(b.doneAt)}に語った本` : pos === 0 ? '次回の本' : pos === 1 ? '次々回の本' : 'その先の本';
  const ordered = [...snap.members].sort((a, c) => (a.id === snap.me ? -1 : c.id === snap.me ? 1 : 0));
  const memos = memosOf(snap, b.id);
  const shown = memos.filter((m) => filter === 'all' || (filter === 'talk' ? m.type === 'talk' : m.type !== 'talk'))
    .sort((x, y) => (x.page ?? 1e9) - (y.page ?? 1e9) || String(x.createdAt).localeCompare(String(y.createdAt)));

  function finish() {
    const d = plan && plan.date <= today ? plan.date : todayStr();
    saveItem(roomId, { ...b, doneAt: d });
    celebrate();
    const rest = q.queue.filter((x) => x.id !== b.id).length;
    if (rest < 2) {
      const p = snap.memberById.get(nextPicker(snap.books, snap.members));
      toast(`おつかれさま！次々回の本を決めよう${p ? `（${p.name}の番）` : ''}`, { action: '本を選ぶ', onAction: () => go(`/r/${roomId}/book?add=1`), duration: 7000 });
    } else toast('おつかれさま！これまでの本に入れたよ');
  }
  async function remove() {
    if (!(await confirmDialog({ title: `『${b.title}』を消しますか？`, body: '付箋やメモは残りますが、本の一覧からは消えます。', ok: '消す', danger: true }))) return;
    const undo = deleteItem(roomId, b.id);
    toast('消しました', { action: '元に戻す', onAction: undo });
    go(`/r/${roomId}/book`, { replace: true });
  }
  async function copyAll() {
    const lines = [`『${b.title}』${b.author ? ' ' + b.author : ''}`];
    for (const m of shown) {
      const who = snap.memberById.get(m.createdBy)?.name ?? '';
      if (m.type === 'talk') lines.push(`★ ${snap.memberById.get(m.about)?.name ?? ''}の話（${who}のメモ）${m.page ? ` p.${m.page}` : ''}\n${m.text}`);
      else lines.push(`${m.page ? `p.${m.page} ` : ''}${m.quote ? `「${m.quote}」` : ''}${m.emotions?.length ? ` [${m.emotions.join('・')}]` : ''}${m.insight ? `\n→ ${m.insight}` : ''}（${who}）`);
    }
    if (await copyText(lines.join('\n\n'))) toast('付箋をまとめてコピーしました');
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

    ${isToday ? html`<button class="today-club" onClick=${() => setMemo({ type: 'talk' })}>
      <span class="ic">🌟</span>
      <span class="grow"><span class="t">今日は読書会！</span><span class="s">「この話いいな」と思ったら、すぐメモ</span></span>
      <span class="btn star small"><${Icon} name="plus" />響いた話</span>
    </button>` : !b.doneAt ? html`<div style=${{ marginTop: '16px' }}>
      ${plan && plan.date >= today
        ? html`<button class="card" onClick=${() => go(`/r/${roomId}/p/${plan.id}`)} style=${{ background: 'var(--book-soft)', borderColor: 'var(--book-soft-2)', boxShadow: 'none' }}>
            <div class="row"><${Icon} name="calendar" /><div class="grow bold">${fmtDate(plan.date)}${plan.time ? ' ' + plan.time : ''}に語る</div><${Icon} name="chevronRight" size=${18} /></div>
          </button>`
        : html`<button class="btn book block" onClick=${() => go(`/r/${roomId}/p/new?club=1&book=${b.id}`)}><${Icon} name="calendarPlus" />この本を語る日を決める</button>`}
    </div>` : null}

    <h2 class="section">語りたいこと</h2>
    ${ordered.map((m) => m.id === snap.me
      ? html`<${MyNote} key=${m.id} snap=${snap} b=${b} m=${m} />`
      : html`<${TheirNote} key=${m.id} snap=${snap} b=${b} m=${m} />`)}

    <h2 class="section">付箋 <span class="aside">${memos.length ? `${memos.length}枚` : ''}</span></h2>
    ${memos.length ? html`<div class="row" style=${{ marginBottom: '10px' }}>
      <div class="grow"><${Seg} small=${true} value=${filter} onChange=${setFilter} label="付箋の種類"
        options=${[{ value: 'all', label: 'すべて' }, { value: 'fusen', label: '引用・気づき' }, { value: 'talk', label: '響いた話' }]} /></div>
      <button class="icon-btn" aria-label="まとめてコピー" title="まとめてコピー" onClick=${copyAll}><${Icon} name="copy" size=${20} /></button>
    </div>` : null}
    ${shown.map((m) => html`<${MemoCard} key=${m.id} snap=${snap} m=${m} onOpen=${() => setMemo(m)} />`)}
    ${!memos.length ? html`<div class="note small" style=${{ marginBottom: '10px' }}>
      <${Icon} name="info" size=${18} /><div class="grow">読みながら気になった一文（引用）や気づき、読書会で「この話いいな」と思ったことを残せます。ふたりとも見られます。</div>
    </div>` : null}
    <div class="row" style=${{ marginTop: '10px' }}>
      <button class="btn grow" onClick=${() => setMemo({ type: 'fusen' })}><${Icon} name="quote" />引用・気づき</button>
      <button class="btn grow" onClick=${() => setMemo({ type: 'talk' })}><${Icon} name="star" />響いた話</button>
    </div>

    <div class="list" style=${{ marginTop: '22px' }}>
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
    <${MemoSheet} memo=${memo} onClose=${() => setMemo(null)} snap=${snap} b=${b} />
  </div>`;
}

// ---------------------------------------------------------------------
// 語りたいこと（ひとり1枚。自動で保存）
// ---------------------------------------------------------------------
function MyNote({ snap, b, m }) {
  const note = noteOf(snap, b.id, m.id);
  const [text, setText] = useState(note?.text ?? '');
  const timer = useRef(null);
  const latest = useRef(text);
  // 別の自分の端末で書いたぶんは、書いている最中でなければ反映する
  useEffect(() => { if (document.activeElement?.id !== 'mynote') setText(note?.text ?? ''); }, [note?.text]);

  function save(patch) {
    const cur = getItem(snap.id, noteId(b.id, m.id));
    saveItem(snap.id, { ...(cur ?? {}), kind: 'note', id: noteId(b.id, m.id), bookId: b.id, memberId: m.id, deleted: false, ...patch });
  }
  function onText(v) {
    setText(v);
    latest.current = v;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; save({ text: latest.current }); }, 700);
  }
  useEffect(() => () => {
    if (timer.current) { clearTimeout(timer.current); save({ text: latest.current }); }
  }, []);
  return html`<div class="note-card" style=${{ borderColor: memberColor(m) + '55' }}>
    <div class="who"><${Avatar} m=${m} size="sm" />${m.name}（あなた）</div>
    <textarea id="mynote" class="input" rows="4" value=${text} placeholder="語りたいこと、気になった一文、ページ数など"
      onInput=${(e) => onText(e.target.value)} onBlur=${() => { if (timer.current) { clearTimeout(timer.current); timer.current = null; save({ text: latest.current }); } }}></textarea>
    <div class="tiny faint" style=${{ marginTop: '4px', textAlign: 'right' }}>自動で保存・相手にも見えます</div>
  </div>`;
}

function TheirNote({ snap, b, m }) {
  const note = noteOf(snap, b.id, m.id);
  return html`<div class="note-card">
    <div class="who"><${Avatar} m=${m} size="sm" />${m.name}</div>
    ${note?.text?.trim() ? html`<div class="body pre">${note.text}</div>` : html`<div class="small faint" style=${{ marginTop: '8px' }}>まだ書いていません</div>`}
  </div>`;
}

// ---------------------------------------------------------------------
// 付箋（引用・気づき／響いた話）
// ---------------------------------------------------------------------
function MemoCard({ snap, m, onOpen }) {
  const author = snap.memberById.get(m.createdBy);
  const mine = m.createdBy === snap.me;
  if (m.type === 'talk') {
    const about = snap.memberById.get(m.about);
    return html`<button class="memo talk" onClick=${onOpen} aria-label=${(about?.name ?? '') + 'の話のメモ'}>
      <div class="mh">
        <span class="talk-who"><${Avatar} m=${about} size="xs" />${about?.name ?? ''}の話</span>
        ${m.page ? html`<span class="pg">p.${m.page}</span>` : null}
        <span class="grow"></span>
        ${(m.emotions ?? []).map((e) => html`<span key=${e} class="emo">${e}</span>`)}
      </div>
      <div class="mt pre">${m.text}</div>
      <div class="mf">${author?.name ?? ''}のメモ${mine ? '・タップで直す' : ''}</div>
    </button>`;
  }
  return html`<button class="memo" onClick=${onOpen} style=${{ '--c': author ? memberColor(author) : 'var(--book)' }}>
    <div class="mh">
      <${Avatar} m=${author} size="xs" />
      ${m.page ? html`<span class="pg">p.${m.page}</span>` : null}
      <span class="grow"></span>
      ${(m.emotions ?? []).map((e) => html`<span key=${e} class="emo">${e}</span>`)}
    </div>
    ${m.quote ? html`<div class="mq pre">${m.quote}</div>` : null}
    ${m.insight ? html`<div class="mi pre"><${Icon} name="bulb" size=${14} />${m.insight}</div>` : null}
  </button>`;
}

function MemoSheet({ memo, onClose, snap, b }) {
  const [v, setV] = useState(null);
  useEffect(() => {
    if (!memo) { setV(null); return; }
    const other = snap.members.find((x) => x.id !== snap.me);
    setV({ type: 'fusen', page: '', quote: '', insight: '', text: '', emotions: [], about: other?.id ?? snap.me, ...memo, page: memo.page ?? '' });
  }, [memo]);
  if (!memo || !v) return null;
  const isNew = !memo.id;
  const mine = isNew || memo.createdBy === snap.me;
  const set = (patch) => setV({ ...v, ...patch });
  const page = String(v.page ?? '').normalize('NFKC').replace(/[^\d]/g, '');
  const ok = v.type === 'talk' ? !!v.text?.trim() : !!(v.quote?.trim() || v.insight?.trim());
  const flipEmo = (e) => set({ emotions: v.emotions.includes(e) ? v.emotions.filter((x) => x !== e) : [...v.emotions, e] });

  function save() {
    if (!ok) return;
    saveItem(snap.id, {
      ...(isNew ? {} : memo),
      kind: 'memo',
      bookId: b.id,
      type: v.type,
      page: page ? Number(page) : null,
      emotions: v.emotions,
      quote: v.type === 'talk' ? null : v.quote?.trim() || null,
      insight: v.type === 'talk' ? null : v.insight?.trim() || null,
      text: v.type === 'talk' ? v.text.trim() : null,
      about: v.type === 'talk' ? v.about : null,
    });
    toast(isNew ? (v.type === 'talk' ? '響いた話をメモしたよ ✦' : '付箋を貼ったよ') : '保存したよ');
    onClose();
  }
  async function remove() {
    if (!(await confirmDialog({ title: 'この付箋をはがしますか？', ok: 'はがす', danger: true }))) return;
    const undo = deleteItem(snap.id, memo.id);
    toast('はがしました', { action: '元に戻す', onAction: undo });
    onClose();
  }

  if (!mine) {
    // 相手の付箋は見るだけ
    return html`<${Sheet} open=${true} onClose=${onClose} title=${memo.type === 'talk' ? '響いた話' : '付箋'}>
      <${MemoCard} snap=${snap} m=${memo} onOpen=${() => {}} />
      <div class="tiny faint" style=${{ textAlign: 'center', marginTop: '10px' }}>${snap.memberById.get(memo.createdBy)?.name ?? '相手'}の付箋です（直せるのは書いた人だけ）</div>
    <//>`;
  }

  const emoRow = html`<div class="field"><span class="label">感情タグ <span class="opt">いくつでも</span></span>
    <div class="chips">${EMOTIONS.map((e) => html`<button key=${e} type="button" class=${'chip' + (v.emotions.includes(e) ? ' on' : '')} aria-pressed=${v.emotions.includes(e)}
      style=${{ minHeight: '34px', fontSize: '13px', padding: '2px 12px' }} onClick=${() => flipEmo(e)}>${e}</button>`)}</div></div>`;
  const pageField = html`<div class="page-field"><span>p.</span><input type="text" inputmode="numeric" value=${v.page} aria-label="ページ" placeholder="—"
    onInput=${(e) => set({ page: e.target.value })} /></div>`;

  return html`<${Sheet} open=${true} onClose=${onClose} title=${isNew ? (v.type === 'talk' ? '響いた話をメモ' : '付箋を貼る') : '付箋を直す'}>
    <div class="stack">
      ${isNew ? html`<${Seg} value=${v.type} onChange=${(t) => set({ type: t })} label="種類"
        options=${[{ value: 'fusen', label: '📝 引用・気づき' }, { value: 'talk', label: '🌟 響いた話' }]} />` : null}
      ${v.type === 'talk' ? html`
        <div class="field"><span class="label">だれの話？</span>
          <div class="row">${snap.members.map((m) => html`<button key=${m.id} type="button" class=${'chip grow' + (v.about === m.id ? ' on' : '')} aria-pressed=${v.about === m.id}
            style=${{ justifyContent: 'center', minHeight: '42px' }} onClick=${() => set({ about: m.id })}><${Avatar} m=${m} size="xs" />${m.id === snap.me ? "自分" : m.name}の話</button>`)}</div>
        </div>
        <div class="field"><label for="talk">響いたこと・いいなと思ったこと</label>
          <textarea id="talk" class="input" rows="4" autoFocus value=${v.text} placeholder="例）主人公の「普通」の話、自分の仕事にもつながるって話が刺さった"
            onInput=${(e) => set({ text: e.target.value })}></textarea></div>
        <div class="row" style=${{ alignItems: 'center' }}><span class="label grow">どこの話？ <span class="opt">任意</span></span>${pageField}</div>
        ${emoRow}
      ` : html`
        <div class="row" style=${{ alignItems: 'center' }}><span class="label grow">引用・気になった箇所</span>${pageField}</div>
        <textarea class="input" rows="3" autoFocus value=${v.quote} placeholder="本文からの引用" aria-label="引用・気になった箇所"
          onInput=${(e) => set({ quote: e.target.value })}></textarea>
        ${emoRow}
        <div class="field"><label for="ins">気づきメモ</label>
          <textarea id="ins" class="input" rows="3" value=${v.insight} placeholder="なぜ気になったか、具体的な気づき"
            onInput=${(e) => set({ insight: e.target.value })}></textarea></div>
      `}
      <button class="btn primary block" disabled=${!ok} onClick=${save}>${isNew ? (v.type === 'talk' ? 'メモする' : '貼る') : '保存'}</button>
      ${!isNew ? html`<button class="btn ghost danger block small" onClick=${remove}><${Icon} name="trash" />はがす</button>` : null}
    </div>
  <//>`;
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
