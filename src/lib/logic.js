// 部屋のデータから「今なにを見せるか」を決める純粋な関数（tests.html でテスト）
import { todayStr, diffDays, seasonOfDate, daysUntilSeason, monthKey, SEASONS, seasonById } from './dates.js';

export const URGENT_DAYS = 30;   // 期限がこの日数以内なら「もうすぐ終わる」
export const SOON_DAYS = 45;     // 季節がこの日数以内に始まるなら「もうすぐ」

// ---------------------------------------------------------------------
// やりたいこと：いつやるのがいいか
//   now      … 今がちょうどいい（今の季節 or 期限が近い）
//   anytime  … いつでも
//   later    … 季節待ち（rank が小さいほど早く来る）
//   expired  … 期限切れ
//   done     … やった
// ---------------------------------------------------------------------
export function wishTiming(w, today = todayStr()) {
  if (w.doneAt) return { group: 'done', rank: 0 };
  const seasons = w.seasons ?? [];
  const left = w.until ? diffDays(today, w.until) : null;
  if (left != null && left < 0) return { group: 'expired', rank: -left };
  const cur = seasonOfDate(today);
  if (left != null && left <= URGENT_DAYS) return { group: 'now', rank: left, urgent: true, left };
  if (seasons.includes(cur)) return { group: 'now', rank: 100, left };
  if (!seasons.length) return { group: 'anytime', rank: 0, left };
  const wait = Math.min(...seasons.map((s) => daysUntilSeason(s, today)));
  const next = seasons.slice().sort((a, b) => daysUntilSeason(a, today) - daysUntilSeason(b, today))[0];
  return { group: 'later', rank: wait, wait, next, soon: wait <= SOON_DAYS, left };
}

export function seasonLabel(seasons) {
  if (!seasons?.length) return 'いつでも';
  return SEASONS.filter((s) => seasons.includes(s.id)).map((s) => s.label).join('・');
}

// 誰が「行きたい／やりたい」と言っているか（追加した人＋「私も」を押した人）
export function wantersOf(w, likes) {
  const set = new Set();
  if (w.createdBy) set.add(w.createdBy);
  for (const l of likes) if (l.wishId === w.id && !l.deleted) set.add(l.memberId);
  return set;
}

// やりたいことを並べる（グループごと・グループ内の順番つき）
export function groupWishes(wishes, { likes = [], memberCount = 2, today = todayStr() } = {}) {
  const groups = { now: [], anytime: [], later: [], expired: [], done: [] };
  for (const w of wishes) {
    const t = wishTiming(w, today);
    const wanters = wantersOf(w, likes);
    groups[t.group].push({ w, t, both: memberCount >= 2 && wanters.size >= memberCount, wanters });
  }
  const newer = (a, b) => String(b.w.createdAt ?? '').localeCompare(String(a.w.createdAt ?? ''));
  const bothFirst = (a, b) => (b.both ? 1 : 0) - (a.both ? 1 : 0);
  groups.now.sort((a, b) => (a.t.rank - b.t.rank) || bothFirst(a, b) || newer(a, b));
  groups.anytime.sort((a, b) => bothFirst(a, b) || newer(a, b));
  groups.later.sort((a, b) => (a.t.rank - b.t.rank) || bothFirst(a, b) || newer(a, b));
  groups.expired.sort((a, b) => a.t.rank - b.t.rank);
  groups.done.sort((a, b) => String(b.w.doneAt).localeCompare(String(a.w.doneAt)) || newer(a, b));
  return groups;
}

// ---------------------------------------------------------------------
// 会う日
// ---------------------------------------------------------------------
export const planEnd = (p) => p.endDate && p.endDate > p.date ? p.endDate : p.date;
const byDate = (a, b) => a.date.localeCompare(b.date) || String(a.time ?? '').localeCompare(String(b.time ?? ''));

export function upcomingPlans(plans, today = todayStr()) {
  return plans.filter((p) => planEnd(p) >= today).sort(byDate);
}
export function pastPlans(plans, today = todayStr()) {
  return plans.filter((p) => planEnd(p) < today).sort((a, b) => byDate(b, a));
}
// 終わったけど、まだ「どうだった？」に答えていない日（60日以内）
export function plansToReview(plans, today = todayStr()) {
  return pastPlans(plans, today).filter((p) => !p.reviewed && diffDays(planEnd(p), today) <= 60);
}
// 今月の読書会（予定も含む）
export function bookClubsInMonth(plans, month /* 'YYYY-MM' */) {
  return plans.filter((p) => p.bookClub && monthKey(p.date) === month).sort(byDate);
}
// やりたいことが入っている、これからの日
export function plansWithWish(plans, wishId, today = todayStr()) {
  return upcomingPlans(plans, today).filter((p) => (p.todos ?? []).some((t) => t.wishId === wishId));
}

// ---------------------------------------------------------------------
// 読書会の本
// ---------------------------------------------------------------------
export function bookQueue(books) {
  const done = books.filter((b) => b.doneAt).sort((a, b) => a.doneAt.localeCompare(b.doneAt) || (a.order ?? 0) - (b.order ?? 0));
  const queue = books.filter((b) => !b.doneAt).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const no = new Map([...done, ...queue].map((b, i) => [b.id, i + 1]));   // 第◯回
  return { done, queue, next: queue[0] ?? null, afterNext: queue[1] ?? null, no };
}

// 次に本を選ぶ人：いちばん最近追加された本を選んだ人ではないほう（交代制）
export function nextPicker(books, members) {
  if (members.length < 2) return members[0]?.id ?? null;
  const last = books.slice().sort((a, b) => (b.order ?? 0) - (a.order ?? 0))[0];
  if (!last?.pickedBy) return null;
  const others = members.filter((m) => m.id !== last.pickedBy);
  return others[0]?.id ?? null;
}

// まだ「これからの読書会の日」に割り当てられていない、いちばん先の本
export function bookForNewClub(books, plans, today = todayStr(), exceptPlanId = null) {
  const { queue } = bookQueue(books);
  const taken = new Set(upcomingPlans(plans, today).filter((p) => p.bookClub && p.bookId && p.id !== exceptPlanId).map((p) => p.bookId));
  return queue.find((b) => !taken.has(b.id)) ?? null;
}

// その本を語る日（これからの日を優先、なければ最後に割り当てられた日）
export function planForBook(plans, bookId, today = todayStr()) {
  const list = plans.filter((p) => p.bookClub && p.bookId === bookId);
  return upcomingPlans(list, today)[0] ?? pastPlans(list, today)[0] ?? null;
}

// 「この日」の見出し（タイトルが無ければ、やることから作る）
export function planTitle(p, { wishById, bookById } = {}) {
  if (p.title?.trim()) return p.title.trim();
  const parts = [];
  if (p.bookClub) parts.push('読書会');
  for (const t of p.todos ?? []) {
    const w = t.wishId ? wishById?.get(t.wishId) : null;
    parts.push(w?.title ?? t.text);
  }
  if (!parts.length) return '会う日';
  return parts.slice(0, 2).join('・') + (parts.length > 2 ? ` ほか${parts.length - 2}件` : '');
}

export { seasonById };
