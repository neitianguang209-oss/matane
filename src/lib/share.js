// 会う日を外に出す：Googleカレンダー・iPhoneのカレンダー(.ics)・LINEの文面
import { PUBLIC_URL } from '../config.js';
import { fmtRange, addDays } from './dates.js';

export const inviteUrl = (roomId) => PUBLIC_URL + '#/r/' + roomId;
export const planUrl = (roomId, planId) => PUBLIC_URL + '#/r/' + roomId + '/p/' + planId;

const ymd = (s) => s.replaceAll('-', '');
const hm = (t) => t.replace(':', '') + '00';

// 予定の名前：相手の名前を入れる（ひかるの端末では「さきと読書会」、さきの端末では「ひかると読書会」）
export function eventName(p, ctx) {
  const other = ctx.members.find((m) => m.id !== ctx.me) ?? ctx.members[1];
  const what = p.bookClub ? '読書会' : '遊ぶ';
  const head = other ? `${other.name}と${what}` : what;
  return p.title?.trim() ? `${head}：${p.title.trim()}` : head;
}

export function planLines(p, ctx) {
  const lines = [];
  if (p.bookClub) {
    const b = p.bookId ? ctx.bookById.get(p.bookId) : null;
    lines.push(`📚 読書会${b ? `『${b.title}』` : ''}`);
  }
  for (const t of p.todos ?? []) {
    const w = t.wishId ? ctx.wishById.get(t.wishId) : null;
    lines.push('・' + (w?.title ?? t.text));
  }
  return lines;
}

function endOf(p) {
  // 時刻がある日は3時間ぶん、無い日は終日（複数日なら最後の日まで）
  if (p.time) {
    const [h, m] = p.time.split(':').map(Number);
    const endH = Math.min(h + 3, 23);
    return { start: `${ymd(p.date)}T${hm(p.time)}`, end: `${ymd(p.endDate || p.date)}T${String(endH).padStart(2, '0')}${String(m).padStart(2, '0')}00` };
  }
  return { start: ymd(p.date), end: ymd(addDays(p.endDate || p.date, 1)) };
}

export function googleCalendarUrl(p, ctx) {
  const { start, end } = endOf(p);
  const details = [...planLines(p, ctx), p.memo ? '\n' + p.memo : '', '\n' + planUrl(ctx.roomId, p.id)].filter(Boolean).join('\n');
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: eventName(p, ctx),
    dates: `${start}/${end}`,
    details,
    ctz: 'Asia/Tokyo',
  });
  if (p.place) q.set('location', p.place);
  return 'https://calendar.google.com/calendar/render?' + q.toString();
}

const icsEscape = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => '\\' + c);
export function icsText(p, ctx) {
  const { start, end } = endOf(p);
  const timed = !!p.time;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const details = [...planLines(p, ctx), p.memo ?? '', planUrl(ctx.roomId, p.id)].filter(Boolean).join('\n');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//matane//JP', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${p.id}@matane`,
    `DTSTAMP:${stamp}`,
    timed ? `DTSTART;TZID=Asia/Tokyo:${start}` : `DTSTART;VALUE=DATE:${start}`,
    timed ? `DTEND;TZID=Asia/Tokyo:${end}` : `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${icsEscape(eventName(p, ctx))}`,
    p.place ? `LOCATION:${icsEscape(p.place)}` : null,
    `DESCRIPTION:${icsEscape(details)}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
}

export function lineText(p, ctx) {
  const when = fmtRange(p.date, p.endDate) + (p.time ? ` ${p.time}〜` : '');
  const lines = [`【またね】${when}`];
  if (p.title?.trim()) lines.push(p.title.trim());
  if (p.place) lines.push('📍 ' + p.place);
  const items = planLines(p, ctx);
  if (items.length) lines.push('', ...items);
  lines.push('', planUrl(ctx.roomId, p.id));
  return lines.join('\n');
}
export const lineShareUrl = (text) => 'https://line.me/R/msg/text/?' + encodeURIComponent(text);

export function downloadFile(name, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export const mapsUrl = (q) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);

