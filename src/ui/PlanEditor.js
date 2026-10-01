import { html, React } from '../lib/html.js';
import { back, go } from '../lib/router.js';
import { saveItem, deleteItem } from '../lib/store.js';
import { newId } from '../lib/ids.js';
import { todayStr, fmtDate, fmtLong, addDays, weekdayOf } from '../lib/dates.js';
import { groupWishes, bookQueue, bookForNewClub, planForBook } from '../lib/logic.js';
import { useRoom } from './hooks.js';
import { Icon } from './icons.js';
import { Sheet, Switch, TopBar, toast, confirmDialog, Cover } from './components.js';
import { wishEmoji, KINDS } from './rows.js';
import { fold } from './WishTab.js';

const { useState } = React;

// 次の土曜（よく遊ぶ日の候補）
function nextWeekday(from, wd) {
  let d = from;
  for (let i = 0; i < 7; i++) { if (weekdayOf(d) === wd && d !== from) return d; d = addDays(d, 1); }
  return d;
}

export function PlanEditor({ roomId, id, query }) {
  const { snap } = useRoom(roomId);
  const orig = id ? snap.planById.get(id) : null;
  const today = todayStr();
  const [p, setP] = useState(() => {
    if (orig) return { ...orig, todos: [...(orig.todos ?? [])] };
    const date = query?.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date) ? query.date : '';
    const fromWish = query?.wish ? snap.wishById.get(query.wish) : null;
    const club = query?.club === '1';
    const book = club ? (query?.book && snap.bookById.get(query.book)) || bookForNewClub(snap.books, snap.plans, today) : null;
    return {
      date, time: '', endDate: '', title: '', place: '', memo: '',
      bookClub: club, bookId: book?.id ?? null,
      todos: fromWish ? [{ id: newId('t'), text: fromWish.title, wishId: fromWish.id }] : [],
    };
  });
  const [multi, setMulti] = useState(!!(orig?.endDate && orig.endDate !== orig.date));
  const [pickOpen, setPickOpen] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const [text, setText] = useState('');
  const set = (patch) => setP((cur) => ({ ...cur, ...patch }));

  if (id && !orig) {
    return html`<div class="page no-nav"><${TopBar} title="会う日" onBack=${() => back(`/r/${roomId}/cal`)} />
      <div class="empty"><div class="e">🫥</div><div class="t">見つかりませんでした</div></div></div>`;
  }

  const ok = !!p.date && (!multi || !p.endDate || p.endDate >= p.date);
  const book = p.bookId ? snap.bookById.get(p.bookId) : null;

  function setClub(on) {
    if (on && !p.bookId) {
      const b = bookForNewClub(snap.books, snap.plans, today, orig?.id);
      set({ bookClub: true, bookId: b?.id ?? null });
    } else set({ bookClub: on });
  }
  function addText() {
    const t = text.trim();
    if (!t) return;
    set({ todos: [...p.todos, { id: newId('t'), text: t, wishId: null }] });
    setText('');
  }
  function move(i, d) {
    const list = [...p.todos];
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    set({ todos: list });
  }
  function save() {
    if (!ok) return;
    const pendingText = text.trim();
    const todos = pendingText ? [...p.todos, { id: newId('t'), text: pendingText, wishId: null }] : p.todos;
    const saved = saveItem(roomId, {
      ...(orig ?? {}),
      kind: 'plan',
      date: p.date,
      endDate: multi && p.endDate && p.endDate > p.date ? p.endDate : null,
      time: p.time || null,
      title: p.title?.trim() || null,
      place: p.place?.trim() || null,
      memo: p.memo?.trim() || null,
      bookClub: !!p.bookClub,
      bookId: p.bookClub ? p.bookId ?? null : null,
      todos,
      // 過去の日に変えたら、もう一度「どうだった？」を出す
      reviewed: orig && orig.date === p.date ? orig.reviewed ?? false : false,
    });
    toast(orig ? '保存したよ' : `${fmtDate(saved.date)}を入れたよ`);
    if (orig) back(`/r/${roomId}/p/${saved.id}`);
    else go(`/r/${roomId}/p/${saved.id}`, { replace: true });
  }
  async function remove() {
    if (!(await confirmDialog({ title: `${fmtDate(orig.date)}の予定を消しますか？`, ok: '消す', danger: true }))) return;
    const undo = deleteItem(roomId, orig.id);
    toast('消しました', { action: '元に戻す', onAction: undo });
    go(`/r/${roomId}/cal`, { replace: true });
  }

  const sat = nextWeekday(today, 6), sun = nextWeekday(today, 0);
  return html`<div class="page no-nav">
    <${TopBar} title=${orig ? '予定を編集' : '会う日を決める'} onBack=${() => back(`/r/${roomId}/cal`)} />
    <div class="stack" style=${{ gap: '18px' }}>
      <div class="card stack">
        <div class="field">
          <label for="pd">日にち</label>
          <input id="pd" type="date" class="input" value=${p.date} onInput=${(e) => set({ date: e.target.value })} />
          ${!p.date ? html`<div class="chips">
            ${[['今日', today], ['明日', addDays(today, 1)], ['次の土曜', sat], ['次の日曜', sun]].map(([l, d]) => html`
              <button key=${l} type="button" class="chip" style=${{ minHeight: '32px', fontSize: '13px' }} onClick=${() => set({ date: d })}>${l}<span class="faint num">${fmtDate(d, { weekday: false })}</span></button>`)}
          </div>` : html`<div class="small bold" style=${{ paddingLeft: '2px' }}>${fmtLong(p.date)}</div>`}
        </div>
        <div class="row" style=${{ alignItems: 'flex-end' }}>
          <div class="field grow"><label for="pt">集合時間 <span class="opt">任意</span></label>
            <input id="pt" type="time" class="input" value=${p.time ?? ''} step="900" onInput=${(e) => set({ time: e.target.value })} /></div>
          ${p.time ? html`<button class="btn soft small" style=${{ marginBottom: '6px' }} onClick=${() => set({ time: '' })}>なし</button>` : null}
        </div>
        <${Switch} on=${multi} onChange=${(v) => { setMulti(v); if (v && !p.endDate && p.date) set({ endDate: addDays(p.date, 1) }); }} sub="旅行など、何日か続くとき">何日か続く</${Switch}>
        ${multi ? html`<div class="field"><label for="pe">最後の日</label>
          <input id="pe" type="date" class="input" value=${p.endDate ?? ''} min=${p.date} onInput=${(e) => set({ endDate: e.target.value })} /></div>` : null}
      </div>

      <div class="card stack" style=${p.bookClub ? { borderColor: 'var(--book-soft-2)', background: '#fbfdfc' } : null}>
        <${Switch} on=${!!p.bookClub} onChange=${setClub} sub="この日に本の話をする">📚 読書会をやる</${Switch}>
        ${p.bookClub ? html`<button class="book-row" onClick=${() => setBookOpen(true)} style=${{ padding: '4px 0' }}>
          ${book ? html`<${Cover} book=${book} width=${44} />` : html`<div class="cover" style=${{ '--w': '44px', display: 'grid', placeItems: 'center', fontSize: '20px', boxShadow: 'none', border: '1.5px dashed var(--book-soft-2)', background: 'var(--book-soft)' }}>?</div>`}
          <span class="info">
            <span class="kick" style=${{ display: 'block' }}>語る本</span>
            <span class="bold" style=${{ display: 'block' }}>${book ? `『${book.title}』` : 'まだ決まっていません'}</span>
            <span class="tiny muted">${book ? 'タップで変更' : 'タップして選ぶ（あとで決めてもOK）'}</span>
          </span>
          <${Icon} name="chevronRight" size=${18} />
        </button>` : null}
      </div>

      <div class="field">
        <span class="label">この日やること</span>
        <div class="list">
          ${p.todos.map((t, i) => {
            const w = t.wishId ? snap.wishById.get(t.wishId) : null;
            return html`<div class="todo-edit" key=${t.id}>
              <span class="em">${w ? wishEmoji(w) : '・'}</span>
              <span class="tt"><span style=${{ display: 'block' }}>${w?.title ?? t.text}</span>${w ? html`<span class="tiny faint" style=${{ display: 'block', fontWeight: 500 }}>いつかリストから</span>` : null}</span>
              ${p.todos.length > 1 ? html`
                <button class="mini-btn" aria-label="上へ" disabled=${i === 0} onClick=${() => move(i, -1)}><${Icon} name="arrowUp" /></button>
                <button class="mini-btn" aria-label="下へ" disabled=${i === p.todos.length - 1} onClick=${() => move(i, 1)}><${Icon} name="arrowDown" /></button>` : null}
              <button class="mini-btn" aria-label="外す" onClick=${() => set({ todos: p.todos.filter((x) => x.id !== t.id) })}><${Icon} name="close" /></button>
            </div>`;
          })}
          <button class="list-item" onClick=${() => setPickOpen(true)} style=${{ color: 'var(--accent-deep)' }}>
            <${Icon} name="heart" /><span class="grow bold">いつかリストから選ぶ</span><${Icon} name="chevronRight" size=${18} />
          </button>
          <div class="add-row">
            <input class="input grow" value=${text} placeholder="自由に書く（例：ランチ、買い物）" aria-label="やることを書く"
              onInput=${(e) => setText(e.target.value)} onKeyDown=${(e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); addText(); } }} />
            <button class="btn soft" disabled=${!text.trim()} onClick=${addText} aria-label="追加"><${Icon} name="plus" /></button>
          </div>
        </div>
      </div>

      <div class="field"><label for="pp">場所 <span class="opt">集合場所・エリア</span></label>
        <input id="pp" class="input" value=${p.place ?? ''} placeholder="例）渋谷ハチ公前" onInput=${(e) => set({ place: e.target.value })} /></div>
      <div class="field"><label for="ptl">タイトル <span class="opt">なければ「やること」から自動で</span></label>
        <input id="ptl" class="input" value=${p.title ?? ''} placeholder="例）誕生日おめでとう会" onInput=${(e) => set({ title: e.target.value })} /></div>
      <div class="field"><label for="pm">メモ <span class="opt">任意</span></label>
        <textarea id="pm" class="input" rows="3" value=${p.memo ?? ''} placeholder="予約した、持ち物、など" onInput=${(e) => set({ memo: e.target.value })}></textarea></div>

      ${orig ? html`<button class="btn ghost danger block" onClick=${remove}><${Icon} name="trash" />この予定を消す</button>` : null}
    </div>

    <div class="bottom-bar"><div class="inner">
      <button class="btn primary block" disabled=${!ok} onClick=${save}>${orig ? '保存' : p.date ? `${fmtDate(p.date)}に決定` : '日にちを選んでください'}</button>
    </div></div>

    <${WishPicker} open=${pickOpen} onClose=${() => setPickOpen(false)} snap=${snap} today=${today}
      chosen=${new Set(p.todos.map((t) => t.wishId).filter(Boolean))}
      onDone=${(ids) => {
        const have = new Set(p.todos.map((t) => t.wishId));
        const add = ids.filter((x) => !have.has(x)).map((wid) => ({ id: newId('t'), text: snap.wishById.get(wid)?.title ?? '', wishId: wid }));
        const keep = p.todos.filter((t) => !t.wishId || ids.includes(t.wishId));
        set({ todos: [...keep, ...add] });
        setPickOpen(false);
      }} />
    <${BookPicker} open=${bookOpen} onClose=${() => setBookOpen(false)} snap=${snap} value=${p.bookId} today=${today} planId=${orig?.id}
      onPick=${(bid) => { set({ bookId: bid }); setBookOpen(false); }} />
  </div>`;
}

// いつかリストから複数選ぶ
function WishPicker({ open, onClose, snap, today, chosen, onDone }) {
  const [sel, setSel] = useState(chosen);
  const [q, setQ] = useState('');
  React.useEffect(() => { if (open) { setSel(new Set(chosen)); setQ(''); } }, [open]);
  const fq = fold(q);
  const list = snap.wishes.filter((w) => !w.doneAt && (!fq || fold([w.title, w.area].join(' ')).includes(fq)));
  const g = groupWishes(list, { likes: snap.likes, memberCount: snap.members.length, today });
  const rows = [...g.now, ...g.anytime, ...g.later];
  const flip = (id) => { const s = new Set(sel); s.has(id) ? s.delete(id) : s.add(id); setSel(s); };
  return html`<${Sheet} open=${open} onClose=${onClose} title="いつかリストから選ぶ">
    <div class="input-wrap" style=${{ marginBottom: '8px' }}>
      <${Icon} name="search" />
      <input class="input" type="search" placeholder="さがす" value=${q} onInput=${(e) => setQ(e.target.value)} aria-label="さがす" />
    </div>
    ${rows.length ? html`<div>
      ${rows.map(({ w, t, both }) => html`<button key=${w.id} class=${'check-row' + (sel.has(w.id) ? ' on' : '')} onClick=${() => flip(w.id)} aria-pressed=${sel.has(w.id)}>
        <span class="box"><${Icon} name="check" stroke=${3} /></span>
        <span style=${{ fontSize: '20px' }}>${wishEmoji(w)}</span>
        <span class="grow"><span class="label-t" style=${{ display: 'block' }}>${w.title}</span>
          <span class="tiny muted">${KINDS[w.type]?.label}${t.group === 'now' ? '・今がちょうどいい' : t.group === 'later' ? '・季節待ち' : ''}${both ? '・ふたりとも♡' : ''}</span></span>
      </button>`)}
    </div>` : html`<div class="empty small">${snap.wishes.length ? '見つかりませんでした' : 'いつかリストはまだ空です'}</div>`}
    <div style=${{ position: 'sticky', bottom: 0, background: 'var(--surface)', paddingTop: '10px' }}>
      <button class="btn primary block" onClick=${() => onDone([...sel])}>${sel.size ? `${sel.size}個をこの日に入れる` : '決定'}</button>
    </div>
  <//>`;
}

// 読書会で語る本を選ぶ
function BookPicker({ open, onClose, snap, value, today, planId, onPick }) {
  const { queue, no } = bookQueue(snap.books);
  return html`<${Sheet} open=${open} onClose=${onClose} title="語る本">
    ${queue.length ? html`<div class="stack tight">
      ${queue.map((b) => {
        const other = planForBook(snap.plans.filter((x) => x.id !== planId), b.id, today);
        const busy = other && other.date >= today;
        return html`<button key=${b.id} class="menu-item" onClick=${() => onPick(b.id)} style=${b.id === value ? { background: 'var(--book-soft)' } : null}>
          <${Cover} book=${b} width=${40} />
          <span class="grow"><span class="t" style=${{ display: 'block' }}>${b.title}</span>
            <span class="s">第${no.get(b.id)}回${busy ? `・${fmtDate(other.date)}にも予定あり` : ''}</span></span>
          ${b.id === value ? html`<${Icon} name="check" />` : null}
        </button>`;
      })}
    </div>` : html`<div class="muted small">まだ本が登録されていません。読書会タブの「本を追加」から入れられます。</div>`}
    <button class="btn ghost block small" style=${{ marginTop: '10px' }} onClick=${() => onPick(null)}>まだ決めない</button>
  <//>`;
}
