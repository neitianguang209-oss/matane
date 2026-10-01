// 流れ星におまかせ：いつかリストから1つ選ぶ（今の季節・いつでもできるものから）
import { html, React } from '../lib/html.js';
import { go } from '../lib/router.js';
import { groupWishes } from '../lib/logic.js';
import { useToday } from './hooks.js';
import { Icon } from './icons.js';
import { Sheet, Seg, Sparkles, celebrate } from './components.js';
import { wishEmoji, KINDS } from './rows.js';
import { AddToPlanSheet } from './WishPage.js';

const { useState, useRef, useEffect } = React;

export function DiceSheet({ open, onClose, snap }) {
  const today = useToday();
  const [type, setType] = useState('all');
  const [cur, setCur] = useState(null);
  const [phase, setPhase] = useState('idle');   // idle | rolling | landed
  const [planOpen, setPlanOpen] = useState(false);
  const timer = useRef(null);

  const g = groupWishes(snap.wishes.filter((w) => type === 'all' || w.type === type), { likes: snap.likes, memberCount: snap.members.length, today });
  let pool = [...g.now, ...g.anytime];
  if (!pool.length) pool = g.later;
  // 「ふたりとも」は2倍当たりやすく
  const weighted = pool.flatMap((x) => (x.both ? [x, x] : [x]));

  useEffect(() => { if (!open) { clearTimeout(timer.current); setPhase('idle'); setCur(null); } }, [open]);
  useEffect(() => () => clearTimeout(timer.current), []);

  function roll() {
    if (!weighted.length) return;
    clearTimeout(timer.current);
    setPhase('rolling');
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let n = 0;
    const total = reduce ? 1 : 16;
    const step = () => {
      const pick = weighted[Math.floor(Math.random() * weighted.length)];
      setCur(pick);
      n++;
      if (n >= total) { setPhase('landed'); celebrate(); return; }
      timer.current = setTimeout(step, 45 + n * n * 1.3);   // だんだんゆっくり
    };
    step();
  }

  const w = cur?.w;
  return html`<${Sheet} open=${open} onClose=${onClose} title="流れ星におまかせ">
    <div class="stack">
      <${Seg} small=${true} value=${type} onChange=${(v) => { setType(v); setPhase('idle'); setCur(null); }} label="種類"
        options=${[{ value: 'all', label: 'なんでも' }, { value: 'go', label: '📍 行きたい' }, { value: 'do', label: '✨ やりたい' }]} />
      <div class=${'dice-stage ' + phase} aria-live="polite">
        <${Sparkles} kind="night" />
        ${phase === 'landed' ? html`<div class="tiny bold" style=${{ color: '#ffe69a', letterSpacing: '.1em' }}>今日はこれ！</div>` : null}
        ${w ? html`
          <div class="em">${wishEmoji(w)}</div>
          <div class="tt">${w.title}</div>
          ${phase === 'landed' ? html`<div class="small muted">${KINDS[w.type]?.long}${w.area ? `・${w.area}` : ''}${cur.both ? '・ふたりとも☆' : ''}</div>` : null}
        ` : weighted.length ? html`
          <div class="em">🌠</div>
          <div class="tt">今日なにする？</div>
          <div class="small muted">流れ星が ${pool.length}個の中から選ぶよ<br />（今の季節・いつでもできるもの。☆ふたりとも は当たりやすい）</div>
        ` : html`
          <div class="em">📝</div>
          <div class="tt">候補がありません</div>
          <div class="small muted">いつかリストに追加すると、ここから選べます</div>
        `}
      </div>
      ${phase === 'landed' && w ? html`<div class="row">
        <button class="btn grow" onClick=${() => { onClose(); go(`/r/${snap.id}/w/${w.id}`); }}>くわしく</button>
        <button class="btn accent grow" onClick=${() => setPlanOpen(true)}><${Icon} name="calendarPlus" />この日にやる</button>
      </div>
      <button class="btn ghost block" onClick=${roll}><${Icon} name="refresh" />もう一回</button>` : html`
      <button class="btn accent block" disabled=${!weighted.length || phase === 'rolling'} onClick=${roll}>
        ${phase === 'rolling' ? '流れ星が選んでいます…' : html`<span style=${{ fontSize: '18px' }}>🌠</span>流れ星にきく`}
      </button>`}
    </div>
    ${w ? html`<${AddToPlanSheet} open=${planOpen} onClose=${() => { setPlanOpen(false); onClose(); }} snap=${snap} wish=${w} today=${today} />` : null}
  <//>`;
}
