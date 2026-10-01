// 部屋のタブ（ホーム・やりたいこと・カレンダー・読書会）と、右下の追加ボタン
import { html, React } from '../lib/html.js';
import { go } from '../lib/router.js';
import { useRoom, useOnline, usePair } from './hooks.js';
import { Icon } from './icons.js';
import { Sheet, SyncDot, AvatarStack } from './components.js';
import { InviteSheet } from './RoomGate.js';
import { HomeTab } from './HomeTab.js';
import { WishTab, listType } from './WishTab.js';
import { CalendarTab } from './CalendarTab.js';
import { BookTab } from './BookTab.js';
import { DiceSheet } from './Dice.js';
import { BookAddSheet } from './BookAdd.js';
import { isNewFromOther } from './rows.js';
import { PhotoViewer } from './photo.js';

const { useState, useEffect } = React;

const TABS = [
  { id: 'home', label: 'ホーム', icon: 'home' },
  { id: 'wish', label: 'やりたいこと', icon: 'star' },
  { id: 'cal', label: 'カレンダー', icon: 'calendar' },
  { id: 'book', label: '読書会', icon: 'book' },
];

export function Room({ roomId, tab, query }) {
  const { snap, sync, pending } = useRoom(roomId);
  const online = useOnline();
  const { me, other } = usePair(snap);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [diceOpen, setDiceOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const base = '/r/' + roomId;

  // ?invite=1（部屋をつくった直後）・?add=1（「次々回の本を決めよう」から）でシートを開き、URLからは消す
  useEffect(() => {
    if (query?.invite !== '1' && query?.add !== '1') return;
    if (query.invite === '1') setInviteOpen(true);
    if (query.add === '1') setBookOpen(true);
    go(base + (tab === 'home' ? '' : '/' + tab), { replace: true });
  }, [query?.invite, query?.add]);

  const hasNew = snap.wishes.some((w) => isNewFromOther(w, snap));
  const ui = {
    openDice: () => setDiceOpen(true),
    openInvite: () => setInviteOpen(true),
    openBookAdd: () => setBookOpen(true),
    openAdd: () => setAddOpen(true),
  };

  const headerRight = html`
    <${SyncDot} sync=${sync} pending=${pending} online=${online} onClick=${() => go(base + '/settings')} />
    <button class="icon-btn" aria-label="ふたりのアイコンを見る" onClick=${() => setViewOpen(true)} style=${{ width: 'auto', padding: '0 4px' }}>
      <${AvatarStack} members=${[me, other]} size="sm" />
    </button>
    <button class="icon-btn" aria-label="設定" onClick=${() => go(base + '/settings')}><${Icon} name="settings" size=${20} /></button>`;

  let body;
  if (tab === 'wish') body = html`<${WishTab} snap=${snap} headerRight=${headerRight} ui=${ui} />`;
  else if (tab === 'cal') body = html`<${CalendarTab} snap=${snap} headerRight=${headerRight} query=${query} />`;
  else if (tab === 'book') body = html`<${BookTab} snap=${snap} headerRight=${headerRight} ui=${ui} />`;
  else body = html`<${HomeTab} snap=${snap} headerRight=${headerRight} ui=${ui} />`;

  const fab = {
    home: html`<button class="fab" onClick=${() => setAddOpen(true)} aria-label="追加"><${Icon} name="plus" />追加</button>`,
    wish: html`<button class="fab" onClick=${() => go(base + '/w/new?type=' + listType())}><${Icon} name="plus" />追加</button>`,
    cal: html`<button class="fab" onClick=${() => go(base + '/p/new')}><${Icon} name="calendarPlus" />会う日を追加</button>`,
    book: html`<button class="fab book" onClick=${() => setBookOpen(true)}><${Icon} name="plus" />本を追加</button>`,
  }[tab] ?? null;

  return html`<div class="page">
    ${body}
    <div class="fab-wrap">${fab}</div>
    <nav class="tabbar" aria-label="タブ"><div class="inner">
      ${TABS.map((t) => html`<a key=${t.id} href=${'#' + base + (t.id === 'home' ? '' : '/' + t.id)} class=${tab === t.id ? 'on' : ''}
        aria-current=${tab === t.id ? 'page' : undefined}
        onClick=${(e) => { e.preventDefault(); go(base + (t.id === 'home' ? '' : '/' + t.id), { replace: true }); }}>
        <${Icon} name=${t.icon} />${t.label}
        ${t.id === 'wish' && hasNew && tab !== 'wish' ? html`<span class="dot" aria-label="新着あり"></span>` : null}
      </a>`)}
    </div></nav>

    <${AddMenu} open=${addOpen} onClose=${() => setAddOpen(false)} base=${base}
      onBook=${() => { setAddOpen(false); setBookOpen(true); }} onDice=${() => { setAddOpen(false); setDiceOpen(true); }} />
    <${InviteSheet} open=${inviteOpen} onClose=${() => setInviteOpen(false)} snap=${snap} />
    <${DiceSheet} open=${diceOpen} onClose=${() => setDiceOpen(false)} snap=${snap} />
    <${PhotoViewer} open=${viewOpen} onClose=${() => setViewOpen(false)} snap=${snap} initial=${other?.id ?? snap.me}
      onEdit=${() => go(base + '/settings')} />
    <${BookAddSheet} open=${bookOpen} onClose=${() => setBookOpen(false)} snap=${snap} />
  </div>`;
}

function AddMenu({ open, onClose, base, onBook, onDice }) {
  const item = (ic, bg, t, s, onClick) => html`<button class="menu-item" onClick=${onClick}>
    <span class="ic" style=${{ background: bg }}>${ic}</span>
    <span class="grow"><span class="t" style=${{ display: 'block' }}>${t}</span><span class="s">${s}</span></span>
    <${Icon} name="chevronRight" size=${18} />
  </button>`;
  return html`<${Sheet} open=${open} onClose=${onClose} title="なにを追加する？">
    ${item('📍', 'var(--accent-soft)', '行きたいところ・やりたいこと', 'やりたいことリストに入れておく', () => { onClose(); go(base + '/w/new'); })}
    ${item('📅', '#fff4e0', '会う日', '日にちと、その日にやること', () => { onClose(); go(base + '/p/new'); })}
    ${item('📚', 'var(--book-soft)', '読書会の本', '次回・次々回に読む本', onBook)}
    ${item('🌠', 'linear-gradient(135deg, var(--night), var(--night-2))', '流れ星におまかせ', '迷ったら、やりたいことリストから1つ選んでもらう', onDice)}
  <//>`;
}
