import { html, React } from '../lib/html.js';
import { go } from '../lib/router.js';
import { monthGrid, fmtLong, addDays, monthKey, WD, countdown } from '../lib/dates.js';
import { upcomingPlans, bookClubsInMonth, planEnd } from '../lib/logic.js';
import { useHolidays } from '../lib/holidays.js';
import { useToday } from './hooks.js';
import { Icon } from './icons.js';
import { TopBar } from './components.js';
import { PlanCard } from './rows.js';
import { MonthDots } from './HomeTab.js';

const { useState, useMemo, useRef } = React;

export function CalendarTab({ snap, headerRight, query }) {
  const today = useToday();
  const holidays = useHolidays();
  const [ym, setYm] = useState(() => (query?.m && /^\d{4}-\d{2}$/.test(query.m) ? query.m : monthKey(today)));
  const [sel, setSel] = useState(() => (query?.d && /^\d{4}-\d{2}-\d{2}$/.test(query.d) ? query.d : today));
  const [y, m] = ym.split('-').map(Number);
  const weeks = useMemo(() => monthGrid(y, m), [y, m]);

  // 日ごとの予定（複数日の予定は、その期間のすべての日に）
  const byDay = useMemo(() => {
    const map = new Map();
    for (const p of snap.plans) {
      let d = p.date;
      const end = planEnd(p);
      for (let i = 0; d <= end && i < 31; i++) {
        if (!map.has(d)) map.set(d, []);
        map.get(d).push(p);
        d = addDays(d, 1);
      }
    }
    for (const list of map.values()) list.sort((a, b) => String(a.time ?? '').localeCompare(String(b.time ?? '')));
    return map;
  }, [snap.plans]);

  function shift(n) {
    const d = new Date(y, m - 1 + n, 1);
    setYm(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  function goToday() { setYm(monthKey(today)); setSel(today); }

  // 横にスワイプで月を移動
  const touch = useRef(null);
  const onTouchStart = (e) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY }; };
  const onTouchEnd = (e) => {
    const s = touch.current;
    touch.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) shift(dx < 0 ? 1 : -1);
  };

  const selPlans = byDay.get(sel) ?? [];
  const ups = upcomingPlans(snap.plans, today);
  const goal = snap.room.bookClub?.perMonth ?? 2;
  const clubs = bookClubsInMonth(snap.plans, ym);

  return html`<div>
    <${TopBar} title="カレンダー" sub="会う日・読書会">${headerRight}<//>

    <div class="cal-head">
      <div class="ym"><span class="y">${y}</span>${m}月</div>
      ${ym !== monthKey(today) ? html`<button class="btn small soft" onClick=${goToday}>今日</button>` : null}
      <button class="icon-btn" aria-label="前の月" onClick=${() => shift(-1)}><${Icon} name="chevronLeft" /></button>
      <button class="icon-btn" aria-label="次の月" onClick=${() => shift(1)}><${Icon} name="chevronRight" /></button>
    </div>

    <div class="cal" onTouchStart=${onTouchStart} onTouchEnd=${onTouchEnd}>
      <div class="cal-wd">${WD.map((w, i) => html`<span key=${w} class=${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}>${w}</span>`)}</div>
      ${weeks.map((wk, wi) => html`<div class="cal-week" key=${wi}>
        ${wk.map((c) => {
          const plans = byDay.get(c.date) ?? [];
          const hol = holidays[c.date];
          const cls = ['cal-day', !c.inMonth && 'out', c.wd === 0 && 'sun', c.wd === 6 && 'sat', hol && 'hol', c.date === today && 'today', c.date === sel && 'sel'].filter(Boolean).join(' ');
          const label = `${fmtLong(c.date)}${hol ? '・' + hol : ''}${plans.length ? `・予定${plans.length}件` : ''}`;
          return html`<button key=${c.date} class=${cls} aria-label=${label} aria-pressed=${c.date === sel}
            onClick=${() => { setSel(c.date); if (!c.inMonth) setYm(monthKey(c.date)); }}>
            <span class="d">${c.day}</span>
            <span class="marks">
              ${plans.slice(0, 2).map((p) => html`<span key=${p.id} class=${'pill' + (p.bookClub ? ' book' : '') + (planEnd(p) < today ? ' past' : '')}></span>`)}
            </span>
          </button>`;
        })}
      </div>`)}
      <div class="cal-legend"><span><i></i>会う日</span><span><i class="book"></i>読書会</span></div>
    </div>

    <div class="row between" style=${{ margin: '12px 6px 0' }}>
      <span class="small bold muted">${m}月の読書会</span>
      <${MonthDots} clubs=${clubs} goal=${goal} today=${today} />
    </div>

    <div class="day-panel">
      <div class="dh">
        <span class="d">${fmtLong(sel)}${holidays[sel] ? html`<span class="hol-name">${holidays[sel]}</span>` : null}</span>
        <span class="small muted">${sel === today ? '今日' : countdown(sel, today).text}</span>
      </div>
      ${selPlans.map((p) => html`<${PlanCard} key=${p.id} snap=${snap} p=${p} today=${today} showCountdown=${false} />`)}
      <button class="btn block" style=${{ marginTop: selPlans.length ? '10px' : 0, borderStyle: 'dashed' }}
        onClick=${() => go(`/r/${snap.id}/p/new?date=${sel}`)}>
        <${Icon} name="plus" />${selPlans.length ? 'この日にもう1つ' : 'この日に会う'}
      </button>
    </div>

    <h2 class="section">これからの予定 <span class="aside">${ups.length}件</span></h2>
    ${ups.length
      ? ups.slice(0, 8).map((p) => html`<${PlanCard} key=${p.id} snap=${snap} p=${p} today=${today} />`)
      : html`<div class="empty small" style=${{ padding: '20px' }}>まだ予定はありません。<br />カレンダーの日にちをタップして入れられます。</div>`}
  </div>`;
}
