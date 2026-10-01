// いろいろな画面で使う行・カード
import { html } from '../lib/html.js';
import { go } from '../lib/router.js';
import { saveItem, deleteItem, getItem } from '../lib/store.js';
import { likeId } from '../lib/ids.js';
import { fmtDate, fmtRange, countdown, monthOf, parseDate, WD } from '../lib/dates.js';
import { wishTiming, wantersOf, plansWithWish, planTitle, planEnd } from '../lib/logic.js';
import { guessEmoji } from '../lib/emoji.js';
import { Icon } from './icons.js';
import { Avatar, SeasonBadge } from './components.js';

export const KINDS = {
  go: { label: '行きたい', long: '行きたいところ', emoji: '📍' },
  do: { label: 'やりたい', long: 'やりたいこと', emoji: '✨' },
};
export const wishEmoji = (w) => w?.emoji || guessEmoji(w?.title, w?.type);

// 相手が前回ひらいた後に足したもの
export function isNewFromOther(x, snap) {
  return !!(snap.seenBefore && x.createdBy && x.createdBy !== snap.me && String(x.createdAt) > snap.seenBefore && !x.doneAt && !x.private);
}

// 「私も！」の切り替え（自分が追加したものには付けない）
export function toggleLike(snap, w) {
  if (!snap.me || w.createdBy === snap.me) return;
  const id = likeId(w.id, snap.me);
  const cur = getItem(snap.id, id);
  if (cur && !cur.deleted) deleteItem(snap.id, id);
  else saveItem(snap.id, { ...(cur ?? {}), kind: 'like', id, wishId: w.id, memberId: snap.me, deleted: false });
}
export function likedByMe(snap, w) {
  return snap.likes.some((l) => l.wishId === w.id && l.memberId === snap.me);
}

function WishMeta({ w, t, snap, today, compact = false }) {
  const parts = [];
  const plan = plansWithWish(snap.plans, w.id, today)[0];
  if (w.doneAt) parts.push(html`<span class="badge ok" key="d"><${Icon} name="check" />${fmtDate(w.doneAt, { weekday: false })}にやった</span>`);
  else if (plan) parts.push(html`<span class="badge accent" key="p"><${Icon} name="calendar" />${fmtDate(plan.date, { weekday: false })}にやる</span>`);
  if (!w.doneAt && t.urgent) parts.push(html`<span class="badge warn" key="u"><${Icon} name="hourglass" />${t.left === 0 ? '今日まで' : `あと${t.left}日`}</span>`);
  else if (!w.doneAt && w.until && t.group !== 'expired') parts.push(html`<span class="badge" key="un">〜${fmtDate(w.until, { weekday: false })}</span>`);
  if (t.group === 'expired') parts.push(html`<span class="badge" key="ex">${fmtDate(w.until, { weekday: false })}で終了</span>`);
  if (!w.doneAt && t.group === 'later') parts.push(html`<${SeasonBadge} key="s" id=${t.next} />`);
  if ((w.place?.name || w.area) && !compact) parts.push(html`<span key="a" class="row" style=${{ gap: '2px' }}><${Icon} name="mapPin" size=${12} />${w.place?.name || w.area}</span>`);
  return parts;
}

export function WishRow({ snap, w, today, faded = false }) {
  const t = wishTiming(w, today);
  const wanters = wantersOf(w, snap.likes);
  const both = snap.members.length >= 2 && wanters.size >= snap.members.length;
  const author = snap.memberById.get(w.createdBy);
  const mine = w.createdBy === snap.me;
  const liked = likedByMe(snap, w);
  const isNew = isNewFromOther(w, snap);
  return html`<div class=${'wish' + (w.doneAt ? ' done' : '') + (faded ? ' faded' : '')} role="group">
    <button class="row grow" style=${{ background: 'none', border: 0, padding: 0, textAlign: 'left', gap: '12px', minWidth: 0 }}
      onClick=${() => go(`/r/${snap.id}/w/${w.id}`)} aria-label=${w.title}>
      <span class=${'em ' + (w.type ?? '')} aria-hidden="true">${wishEmoji(w)}</span>
      <span class="grow">
        <span class="tt clamp2" style=${{ display: '-webkit-box' }}>${w.title}</span>
        <span class="sub">
          ${isNew ? html`<span class="badge new">NEW</span>` : null}
          <${WishMeta} w=${w} t=${t} snap=${snap} today=${today} />
        </span>
      </span>
    </button>
    <span class="right">
      ${both
        ? html`<span class="both" title="ふたりとも"><${Icon} name="star" size=${14} fill=${true} />ふたりとも</span>`
        : mine || !snap.me
          ? html`<${Avatar} m=${author} size="xs" />`
          : html`<button class=${'heart-btn' + (liked ? ' on' : '')} aria-pressed=${liked} aria-label="私も！"
              onClick=${() => toggleLike(snap, w)}><${Icon} name="star" fill=${liked} /></button>`}
      ${both || mine ? null : html`<${Avatar} m=${author} size="xs" />`}
    </span>
  </div>`;
}

export function WishTile({ snap, w, today }) {
  const t = wishTiming(w, today);
  const wanters = wantersOf(w, snap.likes);
  const both = snap.members.length >= 2 && wanters.size >= snap.members.length;
  const author = snap.memberById.get(w.createdBy);
  return html`<button class="wish-tile" onClick=${() => go(`/r/${snap.id}/w/${w.id}`)}>
    ${isNewFromOther(w, snap) ? html`<span class="badge new">NEW</span>` : null}
    <span class="em" style=${{ background: w.type === 'go' ? 'var(--accent-soft)' : '#f1edfb' }}>${wishEmoji(w)}</span>
    <span class="tt clamp2">${w.title}</span>
    <span class="meta">
      ${t.urgent ? html`<span class="badge warn">あと${t.left}日</span>` : null}
      ${both ? html`<span class="both"><${Icon} name="star" size=${13} fill=${true} />ふたりとも</span>` : html`<${Avatar} m=${author} size="xs" />`}
    </span>
  </button>`;
}

export function PlanCard({ snap, p, today, showCountdown = true }) {
  const d = parseDate(p.date);
  const past = planEnd(p) < today;
  const cd = countdown(p.date, today);
  const book = p.bookClub && p.bookId ? snap.bookById.get(p.bookId) : null;
  const title = planTitle(p, snap);
  return html`<button class=${'plan-card' + (past ? ' past' : '')} onClick=${() => go(`/r/${snap.id}/p/${p.id}`)}>
    <div class=${'date-box' + (p.bookClub ? ' book' : '')}>
      <div class="m">${monthOf(p.date)}月</div>
      <div class="dd">${d.getDate()}</div>
      <div class="w">${WD[d.getDay()]}</div>
    </div>
    <div class="grow">
      <div class="tt ellipsis">${title}</div>
      <div class="sub">
        ${p.endDate && p.endDate !== p.date ? html`<span>${fmtRange(p.date, p.endDate, { weekday: false })}</span>` : null}
        ${p.time ? html`<span class="row" style=${{ gap: '3px' }}><${Icon} name="clock" size=${12} />${p.time}</span>` : null}
        ${p.place ? html`<span class="row ellipsis" style=${{ gap: '3px', maxWidth: '100%' }}><${Icon} name="mapPin" size=${12} />${p.place}</span>` : null}
        ${p.bookClub ? html`<span class="badge book">📚 ${book ? `『${book.title}』` : '本は未定'}</span>` : null}
        ${past && !p.reviewed ? html`<span class="badge accent">どうだった？</span>` : null}
      </div>
    </div>
    ${showCountdown && !past ? html`<span class=${'badge ' + (cd.tone === 'today' ? 'ink' : cd.tone === 'soon' ? 'accent' : '')}>${cd.text}</span>` : null}
  </button>`;
}
