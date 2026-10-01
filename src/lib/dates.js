// 日付・季節まわりの純粋な関数（tests.html でテスト）
// 日付はすべて端末の地方時の 'YYYY-MM-DD' 文字列で持つ（タイムゾーンのずれで1日ずれないように）

export const WD = ['日', '月', '火', '水', '木', '金', '土'];

export function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export function parseDate(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return todayStr(d);
}
// a から b まで何日か（b が後なら正）
export function diffDays(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 864e5);
}
export const monthOf = (s) => Number(String(s).slice(5, 7));
export const monthKey = (s) => String(s).slice(0, 7);
export const weekdayOf = (s) => parseDate(s).getDay();

export function fmtDate(s, { weekday = true, year = false } = {}) {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  return `${year ? y + '/' : ''}${m}/${d}${weekday ? `（${WD[weekdayOf(s)]}）` : ''}`;
}
export function fmtLong(s, { year = false } = {}) {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  return `${year ? y + '年' : ''}${m}月${d}日（${WD[weekdayOf(s)]}）`;
}
// 期間（旅行など複数日）の表示
export function fmtRange(start, end, opts) {
  if (!end || end === start) return fmtDate(start, opts);
  if (monthKey(start) === monthKey(end)) return `${fmtDate(start, opts)}〜${Number(end.slice(8))}日（${WD[weekdayOf(end)]}）`;
  return `${fmtDate(start, opts)}〜${fmtDate(end, opts)}`;
}

// 「あと3日」「今日」など
export function countdown(date, today = todayStr()) {
  const n = diffDays(today, date);
  if (n === 0) return { n, text: '今日！', tone: 'today' };
  if (n === 1) return { n, text: '明日', tone: 'soon' };
  if (n === 2) return { n, text: 'あさって', tone: 'soon' };
  if (n > 0) return { n, text: `あと${n}日`, tone: n <= 7 ? 'soon' : 'later' };
  if (n === -1) return { n, text: 'きのう', tone: 'past' };
  return { n, text: `${-n}日前`, tone: 'past' };
}

// 月のカレンダー（日曜はじまり・6週固定にしないで必要な週だけ）
export function monthGrid(year, month /* 1-12 */) {
  const first = new Date(year, month - 1, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const last = new Date(year, month, 0);
  const weeks = [];
  const d = new Date(start);
  while (d <= last || d.getDay() !== 0) {
    if (d.getDay() === 0) weeks.push([]);
    weeks[weeks.length - 1].push({ date: todayStr(d), inMonth: d.getMonth() === month - 1, day: d.getDate(), wd: d.getDay() });
    d.setDate(d.getDate() + 1);
  }
  return weeks;
}

// ---------------------------------------------------------------------
// 季節
// ---------------------------------------------------------------------
export const SEASONS = [
  { id: 'spring', label: '春', emoji: '🌸', months: [3, 4, 5] },
  { id: 'summer', label: '夏', emoji: '🌻', months: [6, 7, 8] },
  { id: 'autumn', label: '秋', emoji: '🍁', months: [9, 10, 11] },
  { id: 'winter', label: '冬', emoji: '⛄', months: [12, 1, 2] },
];
export const seasonById = (id) => SEASONS.find((s) => s.id === id);
export function seasonOfMonth(m) {
  return SEASONS.find((s) => s.months.includes(m)).id;
}
export function seasonOfDate(s) { return seasonOfMonth(monthOf(s)); }
export function nextSeasonId(id) {
  const i = SEASONS.findIndex((s) => s.id === id);
  return SEASONS[(i + 1) % 4].id;
}
// その季節が始まるまで何日か（今その季節なら0）
export function daysUntilSeason(id, today = todayStr()) {
  if (seasonOfDate(today) === id) return 0;
  const startMonth = seasonById(id).months[0];
  let y = Number(today.slice(0, 4));
  let start = `${y}-${String(startMonth).padStart(2, '0')}-01`;
  if (start <= today) start = `${y + 1}-${String(startMonth).padStart(2, '0')}-01`;
  return diffDays(today, start);
}
