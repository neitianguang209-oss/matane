import { html, React } from '../lib/html.js';
import { go } from '../lib/router.js';
import { saveItem, getItem } from '../lib/store.js';
import { fmtLong, fmtDate, countdown, seasonOfDate, seasonById, monthKey, monthOf, parseDate, WD } from '../lib/dates.js';
import { groupWishes, upcomingPlans, plansToReview, bookQueue, nextPicker, bookClubsInMonth, planForBook, planEnd } from '../lib/logic.js';
import { noteId } from '../lib/ids.js';
import { useToday, usePair } from './hooks.js';
import { Icon } from './icons.js';
import { Cover, Progress, toast } from './components.js';
import { WishTile, wishEmoji, isNewFromOther, KINDS } from './rows.js';

const { useState } = React;

export function HomeTab({ snap, headerRight, ui }) {
  const today = useToday();
  const { me, other } = usePair(snap);
  const upcoming = upcomingPlans(snap.plans, today);
  const reviews = plansToReview(snap.plans, today);
  const groups = groupWishes(snap.wishes, { likes: snap.likes, memberCount: snap.members.length, today });
  const season = seasonById(seasonOfDate(today));
  const news = [...snap.wishes, ...snap.books, ...snap.plans]
    .filter((x) => isNewFromOther(x, snap))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  const year = today.slice(0, 4);
  const metThisYear = snap.plans.filter((p) => p.date.startsWith(year) && p.date <= today).length;
  const doneCount = groups.done.length;
  const booksDone = snap.books.filter((b) => b.doneAt).length;

  return html`<div>
    <header class="home-head">
      <img class="logo" src="icons/icon-192.png" alt="" />
      <div class="name grow">またね</div>
      ${headerRight}
    </header>

    <div class="greet">
      <div class="hello">${me ? `${me.name}、` : ''}${greeting(today, upcoming[0])}</div>
      <div class="date">${fmtLong(today)} ・ ${season.emoji} ${season.label}</div>
    </div>

    <${NextHero} snap=${snap} upcoming=${upcoming} today=${today} other=${other} />

    ${reviews.length ? html`<h2 class="section">ふりかえり <span class="aside">やったことにチェック</span></h2>
      ${reviews.slice(0, 2).map((p) => html`<${ReviewCard} key=${p.id} snap=${snap} p=${p} ui=${ui} />`)}` : null}

    ${news.length ? html`<h2 class="section">${other?.name ?? '相手'}から届いたもの <span class="badge new">NEW</span></h2>
      <div class="list">
        ${news.slice(0, 4).map((x) => html`<button class="news" key=${x.id} onClick=${() => go(`/r/${snap.id}/${x.kind === 'wish' ? 'w' : x.kind === 'plan' ? 'p' : 'b'}/${x.id}`)}>
          <span class="em">${x.kind === 'wish' ? wishEmoji(x) : x.kind === 'plan' ? '📅' : '📚'}</span>
          <span class="grow">
            <span class="bold ellipsis" style=${{ display: 'block' }}>${x.kind === 'plan' ? `${fmtDate(x.date)}に会う日` : x.title}</span>
            <span class="tiny muted">${x.kind === 'wish' ? KINDS[x.type]?.long ?? 'いつか' : x.kind === 'plan' ? '会う日' : '読書会の本'}を追加</span>
          </span>
          <${Icon} name="chevronRight" size=${18} />
        </button>`)}
      </div>` : null}

    <h2 class="section">読書会 <button class="aside-btn" onClick=${() => go(`/r/${snap.id}/book`)}>くわしく<${Icon} name="chevronRight" /></button></h2>
    <${ClubCard} snap=${snap} today=${today} ui=${ui} />

    <${SeasonSection} snap=${snap} groups=${groups} season=${season} today=${today} />
    <button class="dice-btn" onClick=${ui.openDice}>
      <span class="ic">🎲</span>
      <span class="grow"><span class="t" style=${{ display: 'block' }}>迷ったら、おまかせ</span><span class="s">いつかリストから今日やることを1つ選ぶよ</span></span>
      <${Icon} name="chevronRight" size=${18} />
    </button>

    <h2 class="section">ふたりの記録</h2>
    <div class="row" style=${{ gap: '8px' }}>
      ${[['今年会った日', metThisYear, '日'], ['やったこと', doneCount, '個'], ['読んだ本', booksDone, '冊']].map(([l, v, u]) => html`
        <div class="card flat grow" key=${l} style=${{ padding: '12px', textAlign: 'center', margin: 0 }}>
          <div class="num" style=${{ fontSize: '24px', fontWeight: 700, lineHeight: 1.2 }}>${v}<span class="small muted" style=${{ marginLeft: '2px' }}>${u}</span></div>
          <div class="tiny muted bold">${l}</div>
        </div>`)}
    </div>
  </div>`;
}

function greeting(today, next) {
  if (!next) return '次はいつ会う？';
  const n = countdown(next.date, today).n;
  if (n <= 0) return '今日は会う日！';
  if (n === 1) return 'いよいよ明日だね';
  if (n <= 7) return `次に会うまで、あと${n}日`;
  return `次は${fmtDate(next.date)}だね`;
}

function NextHero({ snap, upcoming, today, other }) {
  const p = upcoming[0];
  if (!p) {
    return html`<button class="hero empty-hero" onClick=${() => go(`/r/${snap.id}/p/new`)}>
      <div style=${{ fontSize: '34px' }}>📅</div>
      <div class="round bold" style=${{ fontSize: '17px', marginTop: '4px' }}>次に会う日を決めよう</div>
      <div class="small muted" style=${{ marginTop: '2px' }}>${other?.name ? `${other.name}と` : ''}次に会う日と、やりたいことを入れておけます</div>
      <span class="btn primary small" style=${{ marginTop: '12px' }}><${Icon} name="calendarPlus" />日にちを入れる</span>
    </button>`;
  }
  const cd = countdown(p.date, today);
  const ongoing = p.date < today && planEnd(p) >= today;
  const d = parseDate(p.date);
  const book = p.bookClub && p.bookId ? snap.bookById.get(p.bookId) : null;
  const todos = p.todos ?? [];
  const second = upcoming[1];
  return html`<div>
    <button class="hero" onClick=${() => go(`/r/${snap.id}/p/${p.id}`)}>
      <span class=${'count' + (cd.n <= 0 ? ' today' : '')}>${ongoing ? '今日も！' : cd.text}</span>
      <div class="kicker"><${Icon} name="calendar" size=${14} />次に会う日</div>
      <div class="when">
        <span class="md">${monthOf(p.date)}/${d.getDate()}</span>
        <span class="wd">${WD[d.getDay()]}曜日</span>
        ${p.time ? html`<span class="time">${p.time}〜</span>` : null}
        ${p.endDate && p.endDate !== p.date ? html`<span class="time">〜${fmtDate(p.endDate)}</span>` : null}
      </div>
      ${p.title ? html`<div class="round bold" style=${{ marginTop: '6px', fontSize: '16px', position: 'relative', zIndex: 1 }}>${p.title}</div>` : null}
      ${p.place ? html`<div class="place"><${Icon} name="mapPin" />${p.place}</div>` : null}
      ${p.bookClub || todos.length ? html`<div class="what">
        ${p.bookClub ? html`<span class="t book">📚 ${book ? `『${book.title}』` : '読書会'}</span>` : null}
        ${todos.slice(0, 3).map((t) => {
          const w = t.wishId ? snap.wishById.get(t.wishId) : null;
          return html`<span class="t" key=${t.id}><span>${w ? wishEmoji(w) : '・'}</span><span class="ellipsis">${w?.title ?? t.text}</span></span>`;
        })}
        ${todos.length > 3 ? html`<span class="t">ほか${todos.length - 3}件</span>` : null}
      </div>` : html`<div class="small muted" style=${{ marginTop: '10px', position: 'relative', zIndex: 1 }}>なにする？ タップして「やること」を入れよう</div>`}
    </button>
    ${second ? html`<button class="hero-next" onClick=${() => go(`/r/${snap.id}/p/${second.id}`)}>
      <span class="faint">その次</span>
      <span class="bold num">${fmtDate(second.date)}</span>
      ${second.bookClub ? html`<span class="badge book">📚 読書会</span>` : null}
      <span class="faint" style=${{ marginLeft: 'auto' }}>${countdown(second.date, today).text}</span>
    </button>` : null}
  </div>`;
}

// 終わった日の「どうだった？」
export function ReviewCard({ snap, p, ui, embedded = false }) {
  const todos = p.todos ?? [];
  const book = p.bookClub && p.bookId ? snap.bookById.get(p.bookId) : null;
  const [checked, setChecked] = useState(() => {
    const s = {};
    for (const t of todos) s[t.id] = t.done ?? true;
    if (p.bookClub) s.__book = true;
    return s;
  });
  const flip = (k) => setChecked({ ...checked, [k]: !checked[k] });

  function record(skip = false) {
    let wishDone = 0;
    for (const t of todos) {
      if (!t.wishId) continue;
      const w = getItem(snap.id, t.wishId);
      if (!w || w.deleted) continue;
      if (!skip && checked[t.id] && !w.doneAt) { saveItem(snap.id, { ...w, doneAt: p.date, donePlanId: p.id }); wishDone++; }
      if ((skip || !checked[t.id]) && w.donePlanId === p.id) saveItem(snap.id, { ...w, doneAt: null, donePlanId: null });
    }
    let bookDone = false;
    if (p.bookClub && book) {
      if (!skip && checked.__book && !book.doneAt) { saveItem(snap.id, { ...book, doneAt: p.date }); bookDone = true; }
    }
    saveItem(snap.id, {
      ...p,
      reviewed: true,
      todos: todos.map((t) => ({ ...t, done: !skip && !!checked[t.id] })),
      bookClubHeld: p.bookClub ? !skip && !!checked.__book : undefined,
    });
    if (bookDone) {
      const after = bookQueue(snap.books.map((b) => (b.id === book.id ? { ...b, doneAt: p.date } : b)));
      if (after.queue.length < 2) {
        const picker = snap.memberById.get(nextPicker(snap.books, snap.members));
        toast(`おつかれさま！次々回の本を決めよう${picker ? `（${picker.name}の番）` : ''}`, { action: '本を選ぶ', onAction: ui?.openBookAdd, duration: 7000 });
        return;
      }
    }
    toast(skip ? '記録しないでおきました' : wishDone ? `やったこと ${wishDone}個 を記録したよ` : '記録したよ');
  }

  const anything = todos.length || p.bookClub;
  return html`<div class=${embedded ? '' : 'review-card'}>
    ${embedded ? null : html`<div class="row between">
      <div class="round bold" style=${{ fontSize: '16px' }}>${fmtDate(p.date)}、どうだった？</div>
      <button class="link-btn" onClick=${() => go(`/r/${snap.id}/p/${p.id}`)}>ひらく</button>
    </div>`}
    ${anything ? html`<div style=${{ marginTop: '6px' }}>
      ${p.bookClub ? html`<button class=${'check-row' + (checked.__book ? ' on' : '')} onClick=${() => flip('__book')} aria-pressed=${!!checked.__book}>
        <span class="box"><${Icon} name="check" stroke=${3} /></span>
        <span class="label-t grow">📚 読書会${book ? `『${book.title}』` : ''}をやった</span>
      </button>` : null}
      ${todos.map((t) => {
        const w = t.wishId ? snap.wishById.get(t.wishId) : null;
        return html`<button key=${t.id} class=${'check-row' + (checked[t.id] ? ' on' : '')} onClick=${() => flip(t.id)} aria-pressed=${!!checked[t.id]}>
          <span class="box"><${Icon} name="check" stroke=${3} /></span>
          <span class="label-t grow">${w ? wishEmoji(w) + ' ' : ''}${w?.title ?? t.text}</span>
        </button>`;
      })}
    </div>` : html`<div class="small muted" style=${{ margin: '6px 0' }}>この日の「やること」は入っていませんでした。</div>`}
    <div class="row" style=${{ marginTop: '10px' }}>
      <button class="btn small ghost" onClick=${() => record(true)}>記録しない</button>
      <button class="btn small primary grow" onClick=${() => record(false)}><${Icon} name="check" />${anything ? 'チェックしたものを記録' : 'OK'}</button>
    </div>
  </div>`;
}

// 読書会のまとめ（ホーム用）
export function ClubCard({ snap, today, ui }) {
  const q = bookQueue(snap.books);
  const { next, afterNext } = q;
  const goal = snap.room.bookClub?.perMonth ?? 2;
  const month = monthKey(today);
  const clubs = bookClubsInMonth(snap.plans, month);
  const pickerId = nextPicker(snap.books, snap.members);
  const picker = snap.memberById.get(pickerId);
  const isMe = pickerId && pickerId === snap.me;

  return html`<div class="club-card">
    <div class="club-head">
      <span class="t">📚 ${monthOf(today)}月の読書会</span>
      <${MonthDots} clubs=${clubs} goal=${goal} today=${today} />
    </div>
    ${next
      ? html`<div style=${{ marginTop: '14px' }}><${BookLine} snap=${snap} b=${next} no=${q.no.get(next.id)} label="次回の本" today=${today} /></div>`
      : html`<div style=${{ marginTop: '14px' }}><${PickCta} snap=${snap} title="最初の本を決めよう" sub=${picker ? `${picker.name}が選ぶ？` : 'どちらが選んでもOK'} onClick=${ui.openBookAdd} /></div>`}
    ${next ? html`<div class="club-next">
      ${afterNext
        ? html`<${BookLine} snap=${snap} b=${afterNext} no=${q.no.get(afterNext.id)} label="次々回の本" today=${today} small=${true} />`
        : html`<${PickCta} snap=${snap} title=${isMe ? '次々回の本、あなたの番！' : '次々回の本を決めよう'} sub=${picker ? `次は${picker.name}が選ぶ番` : '交代で選ぼう'} onClick=${ui.openBookAdd} />`}
    </div>` : null}
  </div>`;
}

export function MonthDots({ clubs, goal, today }) {
  const n = Math.max(goal, clubs.length);
  const dots = [];
  for (let i = 0; i < n; i++) {
    const c = clubs[i];
    dots.push(html`<i key=${i} class=${c ? (c.date < today ? 'held' : 'set') : ''}></i>`);
  }
  return html`<span class="month-dots" aria-label=${`今月 ${clubs.length}回／目標${goal}回`}>${dots}<span>${clubs.length}/${goal}回</span></span>`;
}

export function PickCta({ title, sub, onClick }) {
  return html`<button class="pick-cta" onClick=${onClick}>
    <span class="ic"><${Icon} name="plus" /></span>
    <span class="grow"><span class="t" style=${{ display: 'block' }}>${title}</span><span class="s">${sub}</span></span>
    <${Icon} name="chevronRight" size=${18} />
  </button>`;
}

export function noteOf(snap, bookId, memberId) {
  return snap.notes.find((n) => n.id === noteId(bookId, memberId)) ?? null;
}

export function BookLine({ snap, b, no, label, today, small = false }) {
  const plan = planForBook(snap.plans, b.id, today);
  const picker = snap.memberById.get(b.pickedBy);
  return html`<button class="book-row" onClick=${() => go(`/r/${snap.id}/b/${b.id}`)}>
    <${Cover} book=${b} width=${small ? 44 : 60} />
    <span class="info">
      <span class="kick" style=${{ display: 'block' }}>${label}${no ? ` ・ 第${no}回` : ''}</span>
      <span class="bt ellipsis" style=${{ display: 'block', fontSize: small ? '15px' : '17px' }}>${b.title}</span>
      <span class="ba row" style=${{ gap: '6px' }}>
        ${plan && plan.date >= today ? html`<span class="bold" style=${{ color: 'var(--book)' }}>${fmtDate(plan.date)}に語る</span>` : html`<span>日にち未定</span>`}
        ${picker ? html`<span class="faint">・${picker.name}が選んだ本</span>` : null}
      </span>
      ${small ? null : snap.members.map((m) => html`<${Progress} key=${m.id} m=${m} value=${noteOf(snap, b.id, m.id)?.progress ?? 0} />`)}
    </span>
  </button>`;
}

function SeasonSection({ snap, groups, season, today }) {
  const now = groups.now;
  const list = now.length ? now : groups.anytime;
  const title = now.length ? `${season.emoji} 今がちょうどいい` : '⏳ いつでもできること';
  if (!list.length) {
    return html`<h2 class="section">${season.emoji} いつかやりたいこと</h2>
      <button class="hero empty-hero" onClick=${() => go(`/r/${snap.id}/w/new`)}>
        <div style=${{ fontSize: '30px' }}>📝</div>
        <div class="round bold" style=${{ fontSize: '16px', marginTop: '4px' }}>行きたいところ・やりたいことを書こう</div>
        <div class="small muted">${season.label}にやりたいこと、期間限定のイベント、いつか行きたいお店…</div>
      </button>`;
  }
  return html`<h2 class="section">${title}
      <button class="aside-btn" onClick=${() => go(`/r/${snap.id}/wish`)}>すべて<${Icon} name="chevronRight" /></button></h2>
    <div class="hscroll">
      ${list.slice(0, 8).map(({ w }) => html`<${WishTile} key=${w.id} snap=${snap} w=${w} today=${today} />`)}
      ${list.length > 8 ? html`<button class="wish-tile more" onClick=${() => go(`/r/${snap.id}/wish`)}>ほか${list.length - 8}件<${Icon} name="chevronRight" size=${18} /></button>` : null}
      <button class="wish-tile more" onClick=${() => go(`/r/${snap.id}/w/new`)}><${Icon} name="plus" />追加</button>
    </div>`;
}
