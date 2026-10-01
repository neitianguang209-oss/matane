import { html, React } from '../lib/html.js';
import { back, go } from '../lib/router.js';
import { saveItem, deleteItem, getItem } from '../lib/store.js';
import { noteId } from '../lib/ids.js';
import { fmtDate, todayStr } from '../lib/dates.js';
import { bookQueue, planForBook, nextPicker, planEnd } from '../lib/logic.js';
import { calilUrl, amazonUrl } from '../lib/books.js';
import { sealItem, cachePlain } from '../lib/lock.js';
import { useRoom, useToday } from './hooks.js';
import { Icon } from './icons.js';
import { TopBar, Cover, Avatar, Sheet, Seg, toast, confirmDialog, memberColor, celebrate, copyText } from './components.js';
import { LockToggle, LockSheet, usePlain, useLock } from './lockui.js';

const { useState, useEffect, useRef } = React;

// 読書記録アプリの付箋と同じ感情タグ
export const EMOTIONS = ['共感', '気づき', '違和感', '感動', '疑問', '学び'];
// 鍵をかけるときに暗号にする欄
const SECRET_FIELDS = ['page', 'quote', 'insight', 'emotions', 'text', 'about'];

export function noteOf(snap, bookId, memberId) {
  return snap.notes.find((n) => n.id === noteId(bookId, memberId)) ?? null;
}
// 見てよい付箋（相手の「自分だけ」は最初から出さない）
export const memosOf = (snap, bookId) => snap.memos.filter((m) => m.bookId === bookId && (!m.private || m.createdBy === snap.me));
const isTalk = (m) => m.type === 'talk';

// 本のカードに出す「準備のようす」：メモを書いたか・付箋・学びの数
export function BookPrep({ snap, b }) {
  const memos = memosOf(snap, b.id);
  const talks = memos.filter(isTalk).length;
  return html`<span class="prep">
    ${snap.members.map((m) => {
      const n = noteOf(snap, b.id, m.id);
      const ok = n && (n.private ? m.id === snap.me : !!n.text?.trim());
      return html`<span key=${m.id} class=${'prep-who' + (ok ? ' ok' : '')} title=${ok ? `${m.name}：メモあり` : `${m.name}：まだ`}>
        <${Avatar} m=${m} size="xs" />${ok ? html`<${Icon} name="check" size=${12} stroke=${3} />` : null}
      </span>`;
    })}
    ${memos.length - talks ? html`<span class="prep-n"><${Icon} name="quote" size=${12} />付箋 ${memos.length - talks}</span>` : null}
    ${talks ? html`<span class="prep-n"><${Icon} name="star" size=${12} />学び ${talks}</span>` : null}
  </span>`;
}

export function BookPage({ roomId, id, query }) {
  const { snap } = useRoom(roomId);
  const today = useToday();
  const [editOpen, setEditOpen] = useState(false);
  const [memo, setMemo] = useState(null);   // 書いている付箋（新規は {type} だけ）
  const b = snap.bookById.get(id);

  // 「学びをメモ」から来たときは、すぐ書けるように開く
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
  const fusen = memos.filter((m) => !isTalk(m)).sort((x, y) => (x.page ?? 1e9) - (y.page ?? 1e9) || String(x.createdAt).localeCompare(String(y.createdAt)));
  const talks = memos.filter(isTalk);

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
    if (!(await confirmDialog({ title: `『${b.title}』を消しますか？`, body: 'メモや付箋は残りますが、本の一覧からは消えます。', ok: '消す', danger: true }))) return;
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

    ${isToday ? html`<button class="today-club" onClick=${() => setMemo({ type: 'talk' })}>
      <span class="ic">🌟</span>
      <span class="grow"><span class="t">今日は読書会！</span><span class="s">学べたこと・新しい視点を、すぐメモ</span></span>
      <span class="btn star small"><${Icon} name="plus" />学び</span>
    </button>` : !b.doneAt ? html`<div style=${{ marginTop: '16px' }}>
      ${plan && plan.date >= today
        ? html`<button class="card" onClick=${() => go(`/r/${roomId}/p/${plan.id}`)} style=${{ background: 'var(--book-soft)', borderColor: 'var(--book-soft-2)', boxShadow: 'none' }}>
            <div class="row"><${Icon} name="calendar" /><div class="grow bold">${fmtDate(plan.date)}${plan.time ? ' ' + plan.time : ''}に語る</div><${Icon} name="chevronRight" size=${18} /></div>
          </button>`
        : html`<button class="btn book block" onClick=${() => go(`/r/${roomId}/p/new?club=1&book=${b.id}`)}><${Icon} name="calendarPlus" />この本を語る日を決める</button>`}
    </div>` : null}

    <h2 class="section">メモ <span class="aside">なんでも自由に</span></h2>
    ${ordered.map((m) => m.id === snap.me
      ? html`<${MyNote} key=${m.id} snap=${snap} b=${b} m=${m} />`
      : html`<${TheirNote} key=${m.id} snap=${snap} b=${b} m=${m} />`)}

    <h2 class="section">付箋 <span class="aside">読みながら思ったこと</span></h2>
    ${fusen.map((m) => html`<${MemoCard} key=${m.id} snap=${snap} m=${m} onOpen=${(plain) => setMemo(plain ?? m)} />`)}
    ${!fusen.length ? html`<div class="hint-box">気になった一文（引用）とページ、そのときの気持ちや気づきを貼っておけます。</div>` : null}
    <div class="row" style=${{ marginTop: '10px' }}>
      <button class="btn grow" onClick=${() => setMemo({ type: 'fusen' })}><${Icon} name="quote" />付箋を貼る</button>
      ${fusen.length ? html`<${CopyButton} snap=${snap} b=${b} list=${fusen} label="付箋" />` : null}
    </div>

    <h2 class="section">読書会で学べたこと <span class="aside">新しい視点</span></h2>
    ${talks.map((m) => html`<${MemoCard} key=${m.id} snap=${snap} m=${m} onOpen=${(plain) => setMemo(plain ?? m)} />`)}
    ${!talks.length ? html`<div class="hint-box">読書会で「その見方はなかった」「この話いいな」と思ったことを残す場所です。</div>` : null}
    <div class="row" style=${{ marginTop: '10px' }}>
      <button class="btn grow" onClick=${() => setMemo({ type: 'talk' })}><${Icon} name="star" />学べたことを書く</button>
      ${talks.length ? html`<${CopyButton} snap=${snap} b=${b} list=${talks} label="学べたこと" />` : null}
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

// まとめてコピー（鍵のかかったものは、開けたものだけ）
function CopyButton({ snap, b, list, label }) {
  async function copy() {
    const { plainOf } = await import('../lib/lock.js');
    const lines = [`『${b.title}』${b.author ? ' ' + b.author : ''}の${label}`];
    for (const raw of list) {
      const m = raw.private ? plainOf(raw) : raw;
      if (!m) continue;
      const who = snap.memberById.get(m.createdBy)?.name ?? '';
      if (isTalk(m)) lines.push(`★ ${m.about === 'both' ? 'ふたりの話' : `${snap.memberById.get(m.about)?.name ?? ''}の話`}（${who}）${m.page ? ` p.${m.page}` : ''}\n${m.text}`);
      else lines.push(`${m.page ? `p.${m.page} ` : ''}${m.quote ? `「${m.quote}」` : ''}${m.emotions?.length ? ` [${m.emotions.join('・')}]` : ''}${m.insight ? `\n→ ${m.insight}` : ''}（${who}）`);
    }
    if (await copyText(lines.join('\n\n'))) toast(`${label}をまとめてコピーしました`);
  }
  return html`<button class="btn soft" style=${{ padding: '0 14px' }} aria-label=${`${label}をまとめてコピー`} title="まとめてコピー" onClick=${copy}><${Icon} name="copy" size=${18} /></button>`;
}

// ---------------------------------------------------------------------
// メモ（フリースペース。ひとり1枚・自動で保存・鍵をかけられる）
// ---------------------------------------------------------------------
function MyNote({ snap, b, m }) {
  const note = noteOf(snap, b.id, m.id);
  const plain = usePlain(snap, note);
  const locked = !!note?.private;
  const canRead = !locked || !!plain;
  const textNow = locked ? plain?.text ?? '' : note?.text ?? '';
  const [text, setText] = useState(textNow);
  const [lockSheet, setLockSheet] = useState(false);
  const timer = useRef(null);
  const latest = useRef(text);
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  // 別の自分の端末で書いたぶんは、書いている最中でなければ反映する
  useEffect(() => {
    if (document.activeElement?.id !== 'mynote') { setText(textNow); latest.current = textNow; }
  }, [textNow]);

  async function save(t, priv = lockedRef.current) {
    const cur = getItem(snap.id, noteId(b.id, m.id));
    const base = { ...(cur ?? {}), kind: 'note', id: noteId(b.id, m.id), bookId: b.id, memberId: m.id, deleted: false, text: t, enc: null, private: false };
    if (!priv) { saveItem(snap.id, base); return; }
    const sealed = await sealItem(snap.id, m.id, base, ['text']);
    const saved = saveItem(snap.id, sealed);
    cachePlain(saved, { text: t });
  }
  function onText(v) {
    setText(v);
    latest.current = v;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; save(latest.current); }, 700);
  }
  useEffect(() => () => {
    if (timer.current) { clearTimeout(timer.current); save(latest.current); }
  }, []);
  async function setLocked(v) {
    try {
      await save(latest.current, v);
      toast(v ? '🔒 自分だけのメモにしたよ（相手には見えません）' : 'ふたりで見られるメモにしたよ');
    } catch { toast('鍵をかけられませんでした'); }
  }

  return html`<div class=${'note-card' + (locked ? ' locked' : '')} style=${{ borderColor: memberColor(m) + '55' }}>
    <div class="who"><${Avatar} m=${m} size="sm" />${m.name}（あなた）<span class="grow"></span>
      ${canRead ? html`<${LockToggle} snap=${snap} on=${locked} onChange=${setLocked} compact=${true} />` : null}</div>
    ${canRead ? html`
      <textarea id="mynote" class="input" rows="4" value=${text} placeholder="なんでも自由に。語りたいこと、気になった一文、考えたこと…"
        onInput=${(e) => onText(e.target.value)} onBlur=${() => { if (timer.current) { clearTimeout(timer.current); timer.current = null; save(latest.current); } }}></textarea>
      <div class="tiny faint" style=${{ marginTop: '4px', textAlign: 'right' }}>自動で保存・${locked ? '🔒 自分だけが読めます' : '相手にも見えます'}</div>
    ` : html`<button class="locked-note" style=${{ marginTop: '8px' }} onClick=${() => setLockSheet(true)}>
      <${Icon} name="lock" size=${16} /><span class="grow">鍵のかかったメモです。合言葉を入れると読めます</span><${Icon} name="chevronRight" size=${16} />
    </button>`}
    <${LockSheet} open=${lockSheet} onClose=${() => setLockSheet(false)} snap=${snap} />
  </div>`;
}

function TheirNote({ snap, b, m }) {
  const note = noteOf(snap, b.id, m.id);
  return html`<div class="note-card">
    <div class="who"><${Avatar} m=${m} size="sm" />${m.name}</div>
    ${note && !note.private && note.text?.trim() ? html`<div class="body pre">${note.text}</div>`
      : html`<div class="small faint" style=${{ marginTop: '8px' }}>${note?.private ? `${m.name}は自分だけのメモを書いています 🔒` : 'まだ書いていません'}</div>`}
  </div>`;
}

// ---------------------------------------------------------------------
// 付箋・学べたこと（1枚ずつ。鍵をかけられる）
// ---------------------------------------------------------------------
function MemoCard({ snap, m: raw, onOpen }) {
  const plain = usePlain(snap, raw);
  const [lockSheet, setLockSheet] = useState(false);
  if (raw.private && !plain) {
    return html`<div>
      <button class="locked-note" style=${{ marginBottom: '10px' }} onClick=${() => setLockSheet(true)}>
        <${Icon} name="lock" size=${16} /><span class="grow">鍵のかかった${isTalk(raw) ? '学び' : '付箋'}（合言葉で開く）</span><${Icon} name="chevronRight" size=${16} />
      </button>
      <${LockSheet} open=${lockSheet} onClose=${() => setLockSheet(false)} snap=${snap} />
    </div>`;
  }
  const m = plain ?? raw;
  const author = snap.memberById.get(m.createdBy);
  const mine = m.createdBy === snap.me;
  const lockMark = m.private ? html`<span class="lockmark"><${Icon} name="lock" size=${11} />自分だけ</span>` : null;
  if (isTalk(m)) {
    const about = m.about === 'both' ? null : snap.memberById.get(m.about);
    return html`<button class="memo talk" onClick=${() => onOpen(m)} aria-label="学べたこと">
      <div class="mh">
        <span class="talk-who">${about ? html`<${Avatar} m=${about} size="xs" />${about.name}の話から` : m.about === 'both' ? '✦ ふたりの話から' : '✦ 学べたこと'}</span>
        ${m.page ? html`<span class="pg">p.${m.page}</span>` : null}
        <span class="grow"></span>
        ${lockMark}
        ${(m.emotions ?? []).map((e) => html`<span key=${e} class="emo">${e}</span>`)}
      </div>
      <div class="mt pre">${m.text}</div>
      <div class="mf">${author?.name ?? ''}のメモ${mine ? '・タップで直す' : ''}</div>
    </button>`;
  }
  return html`<button class="memo" onClick=${() => onOpen(m)} style=${{ '--c': author ? memberColor(author) : 'var(--book)' }}>
    <div class="mh">
      <${Avatar} m=${author} size="xs" />
      ${m.page ? html`<span class="pg">p.${m.page}</span>` : null}
      <span class="grow"></span>
      ${lockMark}
      ${(m.emotions ?? []).map((e) => html`<span key=${e} class="emo">${e}</span>`)}
    </div>
    ${m.quote ? html`<div class="mq pre">${m.quote}</div>` : null}
    ${m.insight ? html`<div class="mi pre"><${Icon} name="bulb" size=${14} />${m.insight}</div>` : null}
  </button>`;
}

function MemoSheet({ memo, onClose, snap, b }) {
  const [v, setV] = useState(null);
  const { ready } = useLock(snap);
  useEffect(() => {
    if (!memo) { setV(null); return; }
    const other = snap.members.find((x) => x.id !== snap.me);
    setV({ type: 'fusen', page: '', quote: '', insight: '', text: '', emotions: [], about: other?.id ?? 'both', ...memo, page: memo.page ?? '', emotions: memo.emotions ?? [], private: !!memo.private });
  }, [memo]);
  if (!memo || !v) return null;
  const isNew = !memo.id;
  const mine = isNew || memo.createdBy === snap.me;
  const set = (patch) => setV({ ...v, ...patch });
  const page = String(v.page ?? '').normalize('NFKC').replace(/[^\d]/g, '');
  const ok = v.type === 'talk' ? !!v.text?.trim() : !!(v.quote?.trim() || v.insight?.trim());
  const flipEmo = (e) => set({ emotions: v.emotions.includes(e) ? v.emotions.filter((x) => x !== e) : [...v.emotions, e] });
  const talk = v.type === 'talk';

  async function save() {
    if (!ok) return;
    const body = {
      page: page ? Number(page) : null,
      emotions: v.emotions,
      quote: talk ? null : v.quote?.trim() || null,
      insight: talk ? null : v.insight?.trim() || null,
      text: talk ? v.text.trim() : null,
      about: talk ? v.about : null,
    };
    const base = { ...(isNew ? {} : getItem(snap.id, memo.id)), kind: 'memo', bookId: b.id, type: v.type, ...body, enc: null, private: false };
    try {
      if (v.private) {
        const saved = saveItem(snap.id, await sealItem(snap.id, snap.me, base, SECRET_FIELDS));
        cachePlain(saved, body);
      } else saveItem(snap.id, base);
    } catch { toast('鍵をかけられませんでした'); return; }
    toast(isNew ? (talk ? '学べたことをメモしたよ ✦' : '付箋を貼ったよ') + (v.private ? '（自分だけ）' : '') : '保存したよ');
    onClose();
  }
  async function remove() {
    if (!(await confirmDialog({ title: talk ? 'このメモを消しますか？' : 'この付箋をはがしますか？', ok: talk ? '消す' : 'はがす', danger: true }))) return;
    const undo = deleteItem(snap.id, memo.id);
    toast(talk ? '消しました' : 'はがしました', { action: '元に戻す', onAction: undo });
    onClose();
  }

  if (!mine) {
    // 相手の付箋は見るだけ
    return html`<${Sheet} open=${true} onClose=${onClose} title=${talk ? '学べたこと' : '付箋'}>
      <${MemoCard} snap=${snap} m=${memo} onOpen=${() => {}} />
      <div class="tiny faint" style=${{ textAlign: 'center', marginTop: '10px' }}>${snap.memberById.get(memo.createdBy)?.name ?? '相手'}のメモです（直せるのは書いた人だけ）</div>
    <//>`;
  }

  const emoRow = html`<div class="field"><span class="label">感情タグ <span class="opt">いくつでも</span></span>
    <div class="chips">${EMOTIONS.map((e) => html`<button key=${e} type="button" class=${'chip' + (v.emotions.includes(e) ? ' on' : '')} aria-pressed=${v.emotions.includes(e)}
      style=${{ minHeight: '34px', fontSize: '13px', padding: '2px 12px' }} onClick=${() => flipEmo(e)}>${e}</button>`)}</div></div>`;
  const pageField = html`<div class="page-field"><span>p.</span><input type="text" inputmode="numeric" value=${v.page} aria-label="ページ" placeholder="—"
    onInput=${(e) => set({ page: e.target.value })} /></div>`;

  return html`<${Sheet} open=${true} onClose=${onClose} title=${isNew ? (talk ? '学べたこと・新しい視点' : '付箋を貼る') : talk ? '学べたことを直す' : '付箋を直す'}>
    <div class="stack">
      ${talk ? html`
        <div class="field"><span class="label">だれの話から？</span>
          <div class="chips">
            ${snap.members.map((m) => html`<button key=${m.id} type="button" class=${'chip' + (v.about === m.id ? ' on' : '')} aria-pressed=${v.about === m.id}
              style=${{ minHeight: '40px' }} onClick=${() => set({ about: m.id })}><${Avatar} m=${m} size="xs" />${m.id === snap.me ? '自分' : m.name}</button>`)}
            <button type="button" class=${'chip' + (v.about === 'both' ? ' on' : '')} aria-pressed=${v.about === 'both'} style=${{ minHeight: '40px' }} onClick=${() => set({ about: 'both' })}>✦ ふたりで話して</button>
          </div>
        </div>
        <div class="field"><label for="talk">学べたこと・新しい視点</label>
          <textarea id="talk" class="input" rows="4" autoFocus value=${v.text} placeholder="例）「普通」は周りが作るものという見方は、自分にはなかった"
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
      <div class="row between" style=${{ alignItems: 'center' }}>
        <span class="small muted">${v.private ? '🔒 自分だけが読めます（暗号で保存）' : '相手にも見えます'}</span>
        <${LockToggle} snap=${snap} on=${v.private} onChange=${(p) => set({ private: p })} />
      </div>
      <button class="btn primary block" disabled=${!ok || (v.private && !ready)} onClick=${save}>${isNew ? (talk ? 'メモする' : '貼る') : '保存'}</button>
      ${!isNew ? html`<button class="btn ghost danger block small" onClick=${remove}><${Icon} name="trash" />${talk ? '消す' : 'はがす'}</button>` : null}
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
