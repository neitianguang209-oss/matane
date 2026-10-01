import { html, React } from '../lib/html.js';
import { back, go } from '../lib/router.js';
import { saveItem, getItem } from '../lib/store.js';
import { newId } from '../lib/ids.js';
import { fmtDate, todayStr, countdown } from '../lib/dates.js';
import { wishTiming, wantersOf, plansWithWish, upcomingPlans, planTitle, seasonLabel } from '../lib/logic.js';
import { mapUrlFor } from '../lib/places.js';
import { useRoom, useToday, usePair } from './hooks.js';
import { Icon } from './icons.js';
import { Avatar, Sheet, TopBar, toast, SeasonBadge, celebrate } from './components.js';
import { KINDS, wishEmoji, toggleLike, likedByMe } from './rows.js';

const { useState } = React;

export function WishPage({ roomId, id }) {
  const { snap } = useRoom(roomId);
  const today = useToday();
  const { other } = usePair(snap);
  const [planOpen, setPlanOpen] = useState(false);
  const w = snap.wishById.get(id);
  if (!w) {
    return html`<div class="page no-nav"><${TopBar} title="やりたいこと" onBack=${() => back(`/r/${roomId}/wish`)} />
      <div class="empty"><div class="e">🫥</div><div class="t">見つかりませんでした</div><div class="small">消されたのかもしれません。</div></div></div>`;
  }
  const t = wishTiming(w, today);
  const author = snap.memberById.get(w.createdBy);
  const wanters = wantersOf(w, snap.likes);
  const both = snap.members.length >= 2 && wanters.size >= snap.members.length;
  const mine = w.createdBy === snap.me;
  const liked = likedByMe(snap, w);
  const plans = plansWithWish(snap.plans, w.id, today);
  const donePlan = w.donePlanId ? snap.planById.get(w.donePlanId) : null;
  const verb = w.type === 'go' ? '行きたい' : 'やりたい';

  function markDone() {
    const prev = { doneAt: w.doneAt ?? null, donePlanId: w.donePlanId ?? null };
    saveItem(roomId, { ...w, doneAt: todayStr(), donePlanId: null });
    celebrate();
    toast('やったね！「やったこと」に入れたよ', { action: '元に戻す', onAction: () => { const cur = getItem(roomId, w.id); if (cur) saveItem(roomId, { ...cur, ...prev }); } });
  }
  function undoDone() {
    saveItem(roomId, { ...w, doneAt: null, donePlanId: null });
    toast('やりたいことリストに戻したよ');
  }

  let host = '';
  try { host = w.url ? new URL(w.url).hostname.replace(/^www\./, '') : ''; } catch { /* そのまま */ }

  return html`<div class="page no-nav">
    <${TopBar} title="" onBack=${() => back(`/r/${roomId}/wish`)}>
      <button class="icon-btn" aria-label="編集" onClick=${() => go(`/r/${roomId}/w/${w.id}/edit`)}><${Icon} name="edit" /></button>
    <//>

    <div class="card" style=${{ padding: '20px 18px' }}>
      <div class="row" style=${{ gap: '14px', alignItems: 'flex-start' }}>
        <div class=${'em'} style=${{ width: '64px', height: '64px', borderRadius: '20px', display: 'grid', placeItems: 'center', fontSize: '34px', flex: 'none', background: w.type === 'go' ? 'var(--accent-soft)' : '#f1edfb' }}>${wishEmoji(w)}</div>
        <div class="grow">
          <div class="tiny bold muted">${KINDS[w.type]?.emoji} ${KINDS[w.type]?.long}</div>
          <h1 class="round" style=${{ fontSize: '22px', margin: '2px 0 0', lineHeight: 1.4 }}>${w.title}</h1>
        </div>
      </div>
      <div class="row wrap" style=${{ gap: '6px', marginTop: '14px' }}>
        ${(w.seasons ?? []).length ? w.seasons.map((s) => html`<${SeasonBadge} key=${s} id=${s} />`) : html`<span class="badge">⏳ いつでも</span>`}
        ${w.until ? html`<span class=${'badge ' + (t.urgent ? 'warn' : '')}><${Icon} name="hourglass" />${fmtDate(w.until)}まで${t.urgent ? `（あと${t.left}日）` : t.group === 'expired' ? '（終了）' : ''}</span>` : null}
        ${w.area ? html`<span class="badge"><${Icon} name="mapPin" />${w.area}</span>` : null}
      </div>
      <div class="divider"></div>
      <div class="row small muted">
        <${Avatar} m=${author} size="sm" />
        <span class="grow">${author?.name ?? '?'}が${w.createdAt ? ` ${fmtDate(todayStr(new Date(w.createdAt)), { weekday: false })} に` : ''}追加</span>
      </div>
      <div style=${{ marginTop: '12px' }}>
        ${both
          ? html`<div class="note" style=${{ background: 'var(--like-soft)', color: 'var(--like)', fontWeight: 700 }}>
              <${Icon} name="star" fill=${true} /><div class="grow">ふたりとも${verb}！</div>
              ${!mine ? html`<button class="link-btn" style=${{ color: 'var(--like)' }} onClick=${() => toggleLike(snap, w)}>取り消す</button>` : null}
            </div>`
          : mine
            ? html`<div class="note"><${Icon} name="star" /><div class="grow">${other?.name ?? '相手'}が ☆ を押すと「ふたりとも」になります</div></div>`
            : html`<button class="btn block" style=${{ borderColor: 'var(--like)', color: 'var(--like)' }} onClick=${() => toggleLike(snap, w)} aria-pressed=${liked}>
                <${Icon} name="star" fill=${liked} />私も${verb}！
              </button>`}
      </div>
    </div>

    ${w.doneAt ? html`<div class="card" style=${{ marginTop: '12px', background: '#f1f9f4', borderColor: '#cfe9d9' }}>
      <div class="row">
        <span style=${{ fontSize: '26px' }}>🎉</span>
        <div class="grow"><div class="bold">${fmtDate(w.doneAt)}にやった！</div>
          ${donePlan ? html`<button class="link-btn" onClick=${() => go(`/r/${roomId}/p/${donePlan.id}`)}>その日の予定を見る</button>` : null}</div>
        <button class="btn small ghost" onClick=${undoDone}>戻す</button>
      </div>
    </div>` : plans.length ? html`<div style=${{ marginTop: '12px' }}>
      ${plans.map((p) => html`<button key=${p.id} class="card" style=${{ background: 'var(--accent-soft)', borderColor: 'var(--accent-soft-2)', boxShadow: 'none' }} onClick=${() => go(`/r/${roomId}/p/${p.id}`)}>
        <div class="row">
          <${Icon} name="calendar" />
          <div class="grow"><div class="bold">${fmtDate(p.date)}にやる予定</div><div class="tiny muted ellipsis">${planTitle(p, snap)}</div></div>
          <span class="badge accent">${countdown(p.date, today).text}</span>
        </div>
      </button>`)}
    </div>` : null}

    ${w.url || w.area || w.type === 'go' ? html`<div class="list" style=${{ marginTop: '12px' }}>
      ${w.url ? html`<a class="list-item" href=${w.url} target="_blank" rel="noopener noreferrer">
        <${Icon} name="link" /><div class="grow"><div class="bold">リンクを開く</div><div class="tiny muted ellipsis">${host || w.url}</div></div><${Icon} name="external" size=${18} />
      </a>` : null}
      ${w.type === 'go' || w.area || w.place ? html`<a class="list-item" href=${mapUrlFor(w)} target="_blank" rel="noopener noreferrer">
        <${Icon} name="mapPin" /><div class="grow"><div class="bold">${w.place ? w.place.name : 'Googleマップで見る'}</div>
          <div class="tiny muted ellipsis">${w.place ? [w.place.kind, w.place.where].filter(Boolean).join('・') + ' ・Googleマップで開く' : `「${[w.title, w.area].filter(Boolean).join(' ')}」で検索`}</div></div><${Icon} name="external" size=${18} />
      </a>` : null}
    </div>` : null}

    ${w.memo ? html`<h2 class="section">メモ</h2><div class="card pre" style=${{ lineHeight: 1.8 }}>${w.memo}</div>` : null}

    <p class="tiny faint" style=${{ textAlign: 'center', marginTop: '20px' }}>いつ：${seasonLabel(w.seasons)}${w.until ? `（${fmtDate(w.until)}まで）` : ''}</p>

    ${!w.doneAt ? html`<div class="bottom-bar"><div class="inner">
      <button class="btn grow" onClick=${markDone}><${Icon} name="star" />やった！</button>
      <button class="btn accent grow" onClick=${() => setPlanOpen(true)}><${Icon} name="calendarPlus" />この日にやる</button>
    </div></div>` : null}

    <${AddToPlanSheet} open=${planOpen} onClose=${() => setPlanOpen(false)} snap=${snap} wish=${w} today=${today} />
  </div>`;
}

// やりたいことを「会う日」に入れる
export function AddToPlanSheet({ open, onClose, snap, wish, today }) {
  const ups = upcomingPlans(snap.plans, today).slice(0, 8);
  function addTo(p) {
    if ((p.todos ?? []).some((t) => t.wishId === wish.id)) { toast('もう入っています'); onClose(); return; }
    saveItem(snap.id, { ...p, todos: [...(p.todos ?? []), { id: newId('t'), text: wish.title, wishId: wish.id }] });
    toast(`${fmtDate(p.date)}に入れたよ`, { action: '見る', onAction: () => go(`/r/${snap.id}/p/${p.id}`) });
    onClose();
  }
  return html`<${Sheet} open=${open} onClose=${onClose} title="いつやる？">
    ${ups.length ? html`<div class="stack tight">
      ${ups.map((p) => {
        const has = (p.todos ?? []).some((t) => t.wishId === wish?.id);
        return html`<button key=${p.id} class="menu-item" onClick=${() => addTo(p)} disabled=${has} style=${has ? { opacity: 0.5 } : null}>
          <span class="ic" style=${{ background: p.bookClub ? 'var(--book-soft)' : 'var(--accent-soft)', fontSize: '15px', fontWeight: 800, fontFamily: 'var(--font-num)' }}>${fmtDate(p.date, { weekday: false })}</span>
          <span class="grow"><span class="t" style=${{ display: 'block' }}>${fmtDate(p.date)}${p.time ? ' ' + p.time : ''}</span><span class="s ellipsis" style=${{ display: 'block' }}>${planTitle(p, snap)}</span></span>
          ${has ? html`<span class="badge ok">入ってる</span>` : html`<span class="badge accent">${countdown(p.date, today).text}</span>`}
        </button>`;
      })}
    </div>` : html`<div class="muted small" style=${{ margin: '0 4px 8px' }}>まだ会う日が入っていません。</div>`}
    <button class="btn primary block" style=${{ marginTop: '12px' }} onClick=${() => { onClose(); go(`/r/${snap.id}/p/new?wish=${wish.id}`); }}>
      <${Icon} name="calendarPlus" />新しく日にちを決める
    </button>
  <//>`;
}
