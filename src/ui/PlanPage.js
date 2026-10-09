import { html } from '../lib/html.js';
import { back, go } from '../lib/router.js';
import { saveItem } from '../lib/store.js';
import { fmtLong, fmtDate, countdown } from '../lib/dates.js';
import { planEnd, planTitle, bookQueue } from '../lib/logic.js';
import { googleCalendarUrl, icsText, lineText, lineShareUrl, downloadFile, mapsUrl } from '../lib/share.js';
import { useRoom, useToday } from './hooks.js';
import { Icon } from './icons.js';
import { TopBar, Cover, toast, copyText, Sparkles, celebrate } from './components.js';
import { wishEmoji } from './rows.js';
import { BookPrep } from './BookPage.js';

export function PlanPage({ roomId, id }) {
  const { snap } = useRoom(roomId);
  const today = useToday();
  const p = snap.planById.get(id);
  if (!p) {
    return html`<div class="page no-nav"><${TopBar} title="会う日" onBack=${() => back(`/r/${roomId}/cal`)} />
      <div class="empty"><div class="e">🫥</div><div class="t">見つかりませんでした</div><div class="small">消されたのかもしれません。</div></div></div>`;
  }
  const past = planEnd(p) < today;
  const cd = countdown(p.date, today);
  const book = p.bookClub && p.bookId ? snap.bookById.get(p.bookId) : null;
  const q = bookQueue(snap.books);
  const ctx = { ...snap, roomId, me: snap.me };
  const todos = p.todos ?? [];

  function toggleTodo(t) {
    const done = !t.done;
    saveItem(roomId, { ...p, todos: todos.map((x) => (x.id === t.id ? { ...x, done } : x)) });
    if (done) celebrate();
    if (t.wishId) {
      const w = snap.wishById.get(t.wishId);
      if (w && done && !w.doneAt) saveItem(roomId, { ...w, doneAt: p.date, donePlanId: p.id });
      if (w && !done && w.donePlanId === p.id) saveItem(roomId, { ...w, doneAt: null, donePlanId: null });
    }
  }
  function ics() {
    downloadFile(`またね_${p.date}.ics`, icsText(p, ctx), 'text/calendar;charset=utf-8');
  }
  async function copyLine() {
    if (await copyText(lineText(p, ctx))) toast('予定の文面をコピーしました');
  }

  return html`<div class="page no-nav">
    <${TopBar} title="" onBack=${() => back(`/r/${roomId}/cal`)}>
      <button class="icon-btn" aria-label="編集" onClick=${() => go(`/r/${roomId}/p/${p.id}/edit`)}><${Icon} name="edit" /></button>
    <//>

    <div class=${'plan-hero' + (p.bookClub && !todos.length ? ' book' : '')}>
      <${Sparkles} kind=${p.bookClub && !todos.length ? 'night' : 'hero'} />
      <div class="dt">${fmtLong(p.date, { year: p.date.slice(0, 4) !== today.slice(0, 4) })}${p.endDate && p.endDate !== p.date ? `〜${fmtDate(p.endDate)}` : ''}${p.time ? `  ${p.time}〜` : ''}</div>
      <h1 class="ttl">${planTitle(p, snap)}</h1>
      <span class=${'cd' + (cd.n === 0 ? ' today' : '')}>${past ? 'おわった日' : cd.text}</span>
    </div>

    ${p.place ? html`<a class="list-item card" style=${{ marginTop: '12px', padding: '12px 14px' }} href=${mapsUrl(p.place)} target="_blank" rel="noopener noreferrer">
      <${Icon} name="mapPin" /><div class="grow"><div class="bold">${p.place}</div><div class="tiny muted">Googleマップで開く</div></div><${Icon} name="external" size=${18} />
    </a>` : null}

    ${p.bookClub ? html`<h2 class="section">📚 読書会</h2>
      ${book ? html`<div class="club-card">
        <button class="book-row" onClick=${() => go(`/r/${roomId}/b/${book.id}`)}>
          <${Cover} book=${book} width=${60} />
          <span class="info">
            <span class="kick" style=${{ display: 'block' }}>第${q.no.get(book.id)}回${book.doneAt ? '・語り終えた本' : ''}</span>
            <span class="bt" style=${{ display: 'block' }}>${book.title}</span>
            ${book.author ? html`<span class="ba">${book.author}</span>` : null}
            <${BookPrep} snap=${snap} b=${book} />
          </span>
        </button>
        ${p.date <= today && planEnd(p) >= today ? html`<button class="today-club" onClick=${() => go(`/r/${roomId}/b/${book.id}?talk=1`)}>
          <span class="ic">🌟</span>
          <span class="grow"><span class="t">今日は読書会！</span><span class="s">学べたこと・新しい視点を、すぐメモ</span></span>
          <span class="btn star small"><${Icon} name="plus" />学び</span>
        </button>` : null}
      </div>` : html`<button class="pick-cta" onClick=${() => go(`/r/${roomId}/p/${p.id}/edit`)}>
        <span class="ic"><${Icon} name="book" /></span>
        <span class="grow"><span class="t" style=${{ display: 'block' }}>語る本がまだ決まっていません</span><span class="s">タップして本を選ぶ</span></span>
      </button>`}` : null}

    <h2 class="section">この日やること ${todos.length ? html`<span class="aside">${todos.filter((t) => t.done).length}/${todos.length}</span>` : null}</h2>
    ${todos.length ? html`<div class="list">
      ${todos.map((t) => {
        const w = t.wishId ? snap.wishById.get(t.wishId) : null;
        return html`<div class="todo" key=${t.id}>
          <button class=${'check-row' + (t.done ? ' on' : '')} style=${{ width: 'auto', padding: 0 }} onClick=${() => toggleTodo(t)} aria-pressed=${!!t.done} aria-label=${(t.done ? 'やった：' : 'まだ：') + (w?.title ?? t.text)}>
            <span class="box"><${Icon} name="check" stroke=${3} /></span>
          </button>
          ${w ? html`<button class="row grow" style=${{ background: 'none', border: 0, padding: 0, textAlign: 'left', gap: '10px' }} onClick=${() => go(`/r/${roomId}/w/${w.id}`)}>
            <span class="em">${wishEmoji(w)}</span>
            <span class="grow"><span class="tt" style=${{ display: 'block', textDecoration: t.done ? 'line-through' : 'none', color: t.done ? 'var(--ink-2)' : undefined }}>${w.title}</span>
              ${w.area ? html`<span class="sub">${w.area}</span>` : null}</span>
            <${Icon} name="chevronRight" size=${16} />
          </button>` : html`<span class="grow tt" style=${{ textDecoration: t.done ? 'line-through' : 'none', color: t.done ? 'var(--ink-2)' : undefined }}>${t.text}</span>`}
        </div>`;
      })}
    </div>` : html`<button class="btn block" style=${{ borderStyle: 'dashed' }} onClick=${() => go(`/r/${roomId}/p/${p.id}/edit`)}>
      <${Icon} name="plus" />やることを入れる
    </button>`}

    ${p.memo ? html`<h2 class="section">メモ</h2><div class="card pre" style=${{ lineHeight: 1.8 }}>${p.memo}</div>` : null}


    ${!past ? html`<h2 class="section">共有・カレンダーに入れる</h2>
      <div class="share-grid">
        <a class="sb" href=${googleCalendarUrl(p, ctx)} target="_blank" rel="noopener noreferrer">
          <span class="ic" style=${{ background: '#e8f0fe' }}>📆</span>Googleカレンダー</a>
        <button class="sb" onClick=${ics}>
          <span class="ic" style=${{ background: '#f2f2f7' }}>🍎</span>iPhoneのカレンダー</button>
        <a class="sb" href=${lineShareUrl(lineText(p, ctx))} target="_blank" rel="noopener">
          <span class="ic" style=${{ background: '#e7f8ee' }}>💬</span>LINEで送る</a>
      </div>
      <div style=${{ textAlign: 'center', marginTop: '8px' }}><button class="link-btn" onClick=${copyLine}>文面をコピー</button></div>` : null}

    ${p.updatedBy ? html`<p class="tiny faint" style=${{ textAlign: 'center', marginTop: '24px' }}>
      ${snap.memberById.get(p.createdBy)?.name ?? ''}が追加${p.updatedBy !== p.createdBy && snap.memberById.get(p.updatedBy) ? `・${snap.memberById.get(p.updatedBy).name}が最後に編集` : ''}
    </p>` : null}
  </div>`;
}
