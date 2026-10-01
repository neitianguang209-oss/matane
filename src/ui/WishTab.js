import { html, React } from '../lib/html.js';
import { go } from '../lib/router.js';
import { seasonOfDate, seasonById } from '../lib/dates.js';
import { groupWishes } from '../lib/logic.js';
import { useToday } from './hooks.js';
import { Icon } from './icons.js';
import { Seg, TopBar } from './components.js';
import { WishRow } from './rows.js';

const { useState } = React;

// ひらがな・カタカナ・全角半角・大文字小文字の違いを無視して探す
export function fold(s) {
  return String(s ?? '').normalize('NFKC').toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s　]+/g, '');
}

export function WishTab({ snap, headerRight }) {
  const today = useToday();
  const [kind, setKind] = useState('all');
  const [bothOnly, setBothOnly] = useState(false);
  const [q, setQ] = useState('');
  const [openDone, setOpenDone] = useState(false);
  const [openExpired, setOpenExpired] = useState(false);
  const season = seasonById(seasonOfDate(today));

  const fq = fold(q);
  const filtered = snap.wishes.filter((w) =>
    (kind === 'all' || w.type === kind) &&
    (!fq || fold([w.title, w.area, w.memo].join(' ')).includes(fq)));
  const groups = groupWishes(filtered, { likes: snap.likes, memberCount: snap.members.length, today });
  const pick = (list) => (bothOnly ? list.filter((x) => x.both) : list);
  const active = groups.now.length + groups.anytime.length + groups.later.length;

  const section = (title, aside, list) => list.length ? html`
    <div class="group-head"><span class="t">${title}</span><span class="n">${list.length}</span>${aside ? html`<span class="tiny faint">${aside}</span>` : null}<span class="line"></span></div>
    <div class="list">${list.map(({ w }) => html`<${WishRow} key=${w.id} snap=${snap} w=${w} today=${today} />`)}</div>` : null;

  const collapsible = (title, open, setOpen, list, faded) => list.length ? html`
    <button class=${'group-toggle' + (open ? ' open' : '')} onClick=${() => setOpen(!open)} aria-expanded=${open}>
      <div class="group-head"><span class="t">${title}</span><span class="n">${list.length}</span><span class="line"></span><${Icon} name="chevronDown" /></div>
    </button>
    ${open ? html`<div class="list">${list.map(({ w }) => html`<${WishRow} key=${w.id} snap=${snap} w=${w} today=${today} faded=${faded} />`)}</div>` : null}` : null;

  return html`<div>
    <${TopBar} title="いつか" sub="行きたいところ・やりたいこと">${headerRight}<//>

    <div class="input-wrap">
      <${Icon} name="search" />
      <input class="input" type="search" placeholder="さがす（店名・場所・メモ）" value=${q} onInput=${(e) => setQ(e.target.value)} aria-label="さがす" />
      ${q ? html`<button class="clear" aria-label="消す" onClick=${() => setQ('')}><${Icon} name="close" size=${18} /></button>` : null}
    </div>
    <div class="filter-row" style=${{ marginTop: '10px' }}>
      <${Seg} small=${true} value=${kind} onChange=${setKind} label="種類"
        options=${[{ value: 'all', label: 'すべて' }, { value: 'go', label: '📍 行きたい' }, { value: 'do', label: '✨ やりたい' }]} />
      <button class=${'toggle-chip' + (bothOnly ? ' on' : '')} aria-pressed=${bothOnly} aria-label="ふたりとも♡のものだけ" title="ふたりとも♡のものだけ"
        onClick=${() => setBothOnly(!bothOnly)}>
        <${Icon} name="heart" fill=${bothOnly} />${bothOnly ? 'ふたりとも' : null}
      </button>
    </div>

    ${!snap.wishes.length ? html`<div class="empty">
      <div class="e">📝</div>
      <div class="t">まだなにもありません</div>
      <div class="small" style=${{ marginTop: '6px', lineHeight: 1.8 }}>行ってみたいお店、見たい景色、やってみたいこと。<br />思いついたら、右下の「いつかを追加」から。</div>
    </div>` : !active && !groups.done.length && !groups.expired.length ? html`<div class="empty">
      <div class="e">🔍</div><div class="t">見つかりませんでした</div>
    </div>` : null}

    ${section(`${season.emoji} 今がちょうどいい`, `${season.label}・期限が近いもの`, pick(groups.now))}
    ${section('⏳ いつでも', null, pick(groups.anytime))}
    ${section('📆 季節待ち', '近い順', pick(groups.later))}
    ${bothOnly && !pick([...groups.now, ...groups.anytime, ...groups.later]).length && active ? html`<div class="empty small">
      まだ「ふたりとも」のものはありません。<br />相手が追加したものに ♡ を押すと「ふたりとも」になります。
    </div>` : null}
    ${collapsible('✓ やったこと', openDone, setOpenDone, groups.done, false)}
    ${collapsible('期限が過ぎたもの', openExpired, setOpenExpired, groups.expired, true)}
    ${active ? html`<p class="tiny faint" style=${{ textAlign: 'center', marginTop: '22px', lineHeight: 1.7 }}>
      相手が追加したものに ♡ を押すと「ふたりとも」に。<br />季節と期限から、今ちょうどいいものが上に来ます。
    </p>` : null}
  </div>`;
}

