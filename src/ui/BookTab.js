import { html } from '../lib/html.js';
import { go } from '../lib/router.js';
import { monthKey, monthOf, fmtDate } from '../lib/dates.js';
import { bookQueue, nextPicker, bookClubsInMonth, planForBook } from '../lib/logic.js';
import { useToday } from './hooks.js';
import { Icon } from './icons.js';
import { TopBar, Cover, Sparkles } from './components.js';
import { MonthDots, PickCta } from './HomeTab.js';
import { BookPrep } from './BookPage.js';

export function BookTab({ snap, headerRight, ui }) {
  const today = useToday();
  const q = bookQueue(snap.books);
  const goal = snap.room.bookClub?.perMonth ?? 2;
  const clubs = bookClubsInMonth(snap.plans, monthKey(today));
  const left = Math.max(0, goal - clubs.length);
  const pickerId = nextPicker(snap.books, snap.members);
  const picker = snap.memberById.get(pickerId);
  const isMe = pickerId && pickerId === snap.me;
  const base = `/r/${snap.id}`;

  return html`<div>
    <${TopBar} title="読書会" sub=${`月${goal}回・同じ本を読んで語る`}>${headerRight}<//>

    <div class="night-card">
      <${Sparkles} kind="night" />
      <div class="club-head">
        <span class="t" style=${{ color: '#fff' }}>${monthOf(today)}月の読書会</span>
        <${MonthDots} clubs=${clubs} goal=${goal} today=${today} night=${true} />
      </div>
      <div class="round bold" style=${{ fontSize: '19px', margin: '10px 0 6px' }}>
        ${left ? `あと${left}回、日にちを決めよう` : '今月の分、決まり！ ✦'}
      </div>
      ${clubs.length ? html`<div class="row wrap" style=${{ gap: '6px' }}>
        ${clubs.map((p) => html`<button key=${p.id} class="night-chip" onClick=${() => go(`${base}/p/${p.id}`)}>
          ${p.date < today ? '★ ' : '☆ '}${fmtDate(p.date)}</button>`)}
      </div>` : null}
      ${left ? html`<button class="btn star small" style=${{ marginTop: '14px' }} onClick=${() => go(`${base}/p/new?club=1`)}>
        <${Icon} name="calendarPlus" />読書会の日を決める</button>` : null}
    </div>

    <h2 class="section">次回の本</h2>
    ${q.next ? html`<${BigBook} snap=${snap} b=${q.next} no=${q.no.get(q.next.id)} today=${today} />`
      : html`<${PickCta} title="最初の本を決めよう" sub=${picker ? `${picker.name}が選ぶ？` : 'どちらが選んでもOK'} onClick=${ui.openBookAdd} />`}

    ${q.next ? html`<h2 class="section">次々回の本 ${q.afterNext ? null : html`<span class="aside">${picker ? `${picker.name}の番` : ''}</span>`}</h2>
      ${q.afterNext ? html`<${SmallBook} snap=${snap} b=${q.afterNext} no=${q.no.get(q.afterNext.id)} today=${today} />`
        : html`<${PickCta} title=${isMe ? 'あなたが選ぶ番！' : '次々回の本を決めよう'} sub=${picker ? `交代制：次は${picker.name}が選ぶ番です` : '交代で選ぼう'} onClick=${ui.openBookAdd} />`}` : null}

    ${q.queue.length > 2 ? html`<h2 class="section">その先 <span class="aside">${q.queue.length - 2}冊</span></h2>
      <div class="list">${q.queue.slice(2).map((b) => html`<button key=${b.id} class="queue-item" onClick=${() => go(`${base}/b/${b.id}`)}>
        <span class="no">第${q.no.get(b.id)}回</span>
        <${Cover} book=${b} width=${34} />
        <span class="grow"><span class="bold ellipsis" style=${{ display: 'block' }}>${b.title}</span>
          <span class="tiny muted">${snap.memberById.get(b.pickedBy)?.name ?? ''}が選んだ本</span></span>
        <${Icon} name="chevronRight" size=${18} />
      </button>`)}</div>` : null}

    <h2 class="section">これまでの本 <span class="aside">${q.done.length}冊</span></h2>
    ${q.done.length ? html`<div class="shelf">
      ${q.done.slice().reverse().map((b) => html`<button key=${b.id} class="sb" onClick=${() => go(`${base}/b/${b.id}`)}>
        <${Cover} book=${b} width="100%" />
        <span class="no">第${q.no.get(b.id)}回・${fmtDate(b.doneAt, { weekday: false })}</span>
        <span class="t clamp2">${b.title}</span>
      </button>`)}
    </div>` : html`<div class="empty small" style=${{ padding: '18px' }}>語り終えた本がここに並びます 📚</div>`}

    <p class="tiny faint" style=${{ textAlign: 'center', marginTop: '24px', lineHeight: 1.7 }}>
      会が終わったら、次々回の本を交代で決めます。<br />読み進みとメモは本をタップして書けます。
    </p>
  </div>`;
}

function BigBook({ snap, b, no, today }) {
  const plan = planForBook(snap.plans, b.id, today);
  const picker = snap.memberById.get(b.pickedBy);
  return html`<button class="card" onClick=${() => go(`/r/${snap.id}/b/${b.id}`)} style=${{ padding: '18px' }}>
    <div class="row top" style=${{ gap: '16px' }}>
      <${Cover} book=${b} width=${92} />
      <div class="grow">
        <div class="tiny bold" style=${{ color: 'var(--book)' }}>第${no}回${picker ? `・${picker.name}が選んだ本` : ''}</div>
        <div class="round bold" style=${{ fontSize: '19px', lineHeight: 1.35, margin: '4px 0' }}>${b.title}</div>
        ${b.author ? html`<div class="small muted">${b.author}</div>` : null}
        <div style=${{ marginTop: '10px' }}>
          ${plan && plan.date >= today
            ? html`<span class="badge book" style=${{ fontSize: '12.5px' }}>📅 ${fmtDate(plan.date)}に語る</span>`
            : html`<span class="badge">日にち未定</span>`}
        </div>
      </div>
    </div>
    <div style=${{ marginTop: '6px' }}><${BookPrep} snap=${snap} b=${b} /></div>
  </button>`;
}

function SmallBook({ snap, b, no, today }) {
  const plan = planForBook(snap.plans, b.id, today);
  const picker = snap.memberById.get(b.pickedBy);
  return html`<button class="card" onClick=${() => go(`/r/${snap.id}/b/${b.id}`)}>
    <div class="row" style=${{ gap: '14px' }}>
      <${Cover} book=${b} width=${52} />
      <div class="grow">
        <div class="tiny bold" style=${{ color: 'var(--book)' }}>第${no}回${picker ? `・${picker.name}が選んだ本` : ''}</div>
        <div class="bold" style=${{ fontSize: '16px', lineHeight: 1.4 }}>${b.title}</div>
        <div class="tiny muted">${b.author ?? ''}${plan && plan.date >= today ? `・${fmtDate(plan.date)}に語る` : ''}</div>
      </div>
      <${Icon} name="chevronRight" size=${18} />
    </div>
  </button>`;
}
