import { html, React } from '../lib/html.js';
import { coverCandidates } from '../lib/books.js';
import { seasonById } from '../lib/dates.js';
import { Icon } from './icons.js';

const { useEffect, useState, useRef } = React;

// ---------------------------------------------------------------------
// ふたりの色
// ---------------------------------------------------------------------
export const MEMBER_COLORS = ['#3a6ee0', '#d6457a', '#16865f', '#b8740a', '#7450d4', '#0e8597', '#cf5a22', '#5b6472'];

function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function inkOn(hex) {
  const L = lum(hex);
  return 1.05 / (L + 0.05) >= (L + 0.05) / (lum('#1f1d1a') + 0.05) ? '#ffffff' : '#1f1d1a';
}
export function memberColor(m) {
  const i = Number.isInteger(m?.color) ? m.color : (m?.order ?? 0);
  return MEMBER_COLORS[((i % 8) + 8) % 8];
}
export function initial(name) {
  const s = String(name ?? '').trim();
  return s ? Array.from(s)[0].toUpperCase() : '?';
}
export function Avatar({ m, size = '', title }) {
  const c = memberColor(m);
  return html`<span class=${'avatar ' + size} style=${{ '--c': c, '--fg': inkOn(c) }} title=${title ?? m?.name} aria-hidden="true">${initial(m?.name)}</span>`;
}
export function AvatarStack({ members, size = 'sm' }) {
  return html`<span class="avatars">${members.filter(Boolean).map((m) => html`<${Avatar} key=${m.id} m=${m} size=${size} />`)}</span>`;
}

// ---------------------------------------------------------------------
// 小物
// ---------------------------------------------------------------------
export function Seg({ options, value, onChange, small = false, big = false, label }) {
  return html`<div class=${'seg' + (small ? ' small' : '') + (big ? ' big' : '')} role="radiogroup" aria-label=${label}>
    ${options.map((o) => html`<button type="button" key=${o.value} role="radio" aria-checked=${value === o.value}
      class=${value === o.value ? 'on' : ''} onClick=${() => onChange(o.value)}>${o.label}</button>`)}
  </div>`;
}

export function Switch({ on, onChange, children, sub, label }) {
  return html`<button type="button" class=${'switch' + (on ? ' on' : '')} role="switch" aria-checked=${!!on}
    aria-label=${label ?? (typeof children === 'string' ? children : undefined)} onClick=${() => onChange(!on)}>
    <span class="grow"><span>${children}</span>${sub ? html`<span class="tiny muted" style=${{ display: 'block', fontWeight: 500 }}>${sub}</span>` : null}</span>
    <span class="track" aria-hidden="true"></span>
  </button>`;
}

export function Stepper({ value, onChange, min = 1, max = 8, format = (v) => v }) {
  const set = (v) => onChange(Math.min(max, Math.max(min, v)));
  return html`<span class="stepper">
    <button type="button" aria-label="減らす" onClick=${() => set(value - 1)}>−</button>
    <span class="v">${format(value)}</span>
    <button type="button" aria-label="増やす" onClick=${() => set(value + 1)}>＋</button>
  </span>`;
}

export function Note({ kind = '', icon = 'info', children }) {
  return html`<div class=${'note ' + kind}><${Icon} name=${icon} size=${18} /><div class="grow">${children}</div></div>`;
}

export function SeasonBadge({ id }) {
  const s = seasonById(id);
  if (!s) return null;
  return html`<span class="badge season" style=${{ '--c': `var(--${id})`, '--cs': `var(--${id}-soft)` }}>${s.emoji} ${s.label}</span>`;
}

// ---------------------------------------------------------------------
// 星と虹
// ---------------------------------------------------------------------
export const RAINBOW = ['#e2462a', '#f28a26', '#f5c330', '#3fae6e', '#3a84d4', '#7457cc'];
const SPARK = 'M12 2c.7 5.3 2.7 7.3 8 8v.1c-5.3.7-7.3 2.7-8 8h-.1c-.7-5.3-2.7-7.3-8-8V10c5.3-.7 7.3-2.7 8-8z';
// [左, 上, 大きさ(px), またたきの遅れ(秒), 色]
const SPARKS = {
  hero: [['78%', '58%', 14, 0], ['88%', '36%', 9, 1.2], ['62%', '18%', 8, 2.1]],
  night: [['91%', '56%', 13, 0], ['78%', '80%', 8, 1.6, '#ffe69a'], ['46%', '7%', 6, 1.1, '#fff'], ['64%', '44%', 7, 2.4, '#fff'], ['6%', '86%', 7, .8, '#ffe69a']],
  sky: [['10%', '14%', 12, 0, '#ffe69a'], ['84%', '12%', 18, .7], ['72%', '46%', 9, 1.5, '#fff'], ['90%', '70%', 8, 2.2, '#ffe69a'], ['40%', '8%', 7, 1.1, '#fff'], ['58%', '30%', 6, 2.8, '#fff']],
  small: [['82%', '22%', 12, 0], ['90%', '62%', 8, 1.3, '#ffe69a']],
};
export function Sparkles({ kind = 'hero' }) {
  return html`<span class="sparkles" aria-hidden="true">
    ${(SPARKS[kind] ?? SPARKS.hero).map(([x, y, s, d, c], i) => html`<svg key=${i} viewBox="0 0 24 24" width=${s} height=${s}
      style=${{ left: x, top: y, animationDelay: d + 's', color: c }}><path d=${SPARK} fill="currentColor" /></svg>`)}
  </span>`;
}

// やった！のときに、星と虹色の紙ふぶきを飛ばす
export function celebrate() {
  try {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const root = document.createElement('div');
    root.className = 'burst';
    root.setAttribute('aria-hidden', 'true');
    const n = 24;
    for (let i = 0; i < n; i++) {
      const el = document.createElement('span');
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
      const dist = 90 + Math.random() * 90;
      const kind = i % 3;
      if (kind === 2) el.className = 'd';
      else el.textContent = kind === 0 ? '★' : '✦';
      el.style.color = kind === 2 ? RAINBOW[i % RAINBOW.length] : i % 2 ? '#f5b014' : RAINBOW[i % RAINBOW.length];
      el.style.setProperty('--dx', Math.cos(a) * dist + 'px');
      el.style.setProperty('--dy', Math.sin(a) * dist + 40 + 'px');
      el.style.setProperty('--rot', (Math.random() * 360 - 180) + 'deg');
      el.style.fontSize = 14 + Math.random() * 12 + 'px';
      root.appendChild(el);
    }
    document.body.appendChild(root);
    setTimeout(() => root.remove(), 1300);
  } catch { /* 飾りなので失敗しても何もしない */ }
}

// 本の表紙：候補URLを順に試し、どれもダメなら色つきの仮の表紙
const PH_COLORS = ['#2b7a5c', '#3b5f9e', '#9a4a6e', '#8a6420', '#4d5b8f', '#6d4b8f', '#2f7f86', '#a3532e'];
function hashColor(s) {
  let h = 0;
  for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return PH_COLORS[h % PH_COLORS.length];
}
export function Cover({ book, width = 64 }) {
  const list = React.useMemo(() => coverCandidates(book ?? {}), [book?.cover, book?.isbn]);
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [list.join('|')]);
  const url = list[i];
  const style = { '--w': typeof width === 'number' ? width + 'px' : width, '--pc': hashColor(book?.title ?? '') };
  return html`<div class="cover" style=${style}>
    ${url
      ? html`<img src=${url} alt="" loading="lazy" referrerpolicy="no-referrer"
          onLoad=${(e) => { if (e.currentTarget.naturalWidth <= 10) setI(i + 1); }}
          onError=${() => setI(i + 1)} />`
      : html`<div class="ph"><div class="pt">${book?.title ?? ''}</div><div class="pa">${book?.author ?? ''}</div></div>`}
  </div>`;
}

export function Progress({ m, value }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  return html`<div class="progress">
    <${Avatar} m=${m} size="xs" />
    <div class="bar" role="progressbar" aria-label=${`${m?.name}の読み進み`} aria-valuenow=${v} aria-valuemin="0" aria-valuemax="100">
      <i style=${{ width: v + '%', '--c': memberColor(m) }}></i>
    </div>
    <span class="pct">${v >= 100 ? '読了' : v + '%'}</span>
  </div>`;
}

// ---------------------------------------------------------------------
// 下から出るシート
// ---------------------------------------------------------------------
export function Sheet({ open, onClose, title, children }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => {
      if (!ref.current?.contains(document.activeElement)) ref.current?.focus();
    }, 30);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      clearTimeout(t);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, [open]);
  if (!open) return null;
  return html`<div>
    <div class="sheet-backdrop" onClick=${onClose}></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label=${title} tabindex="-1" ref=${ref}>
      <div class="grab"></div>
      ${title ? html`<div class="row between"><h3>${title}</h3>
        <button class="icon-btn" aria-label="閉じる" onClick=${onClose}><${Icon} name="close" /></button></div>` : null}
      ${children}
    </div>
  </div>`;
}

// ---------------------------------------------------------------------
// トースト（「元に戻す」付き）
// ---------------------------------------------------------------------
let toastSeq = 0;
const toastListeners = new Set();
let toasts = [];
function setToasts(next) { toasts = next; toastListeners.forEach((f) => f(toasts)); }
export function toast(message, { action, onAction, duration = 3600 } = {}) {
  const id = ++toastSeq;
  setToasts([...toasts.slice(-2), { id, message, action, onAction }]);
  setTimeout(() => setToasts(toasts.filter((t) => t.id !== id)), duration);
}
export function ToastHost() {
  const [list, setList] = useState(toasts);
  useEffect(() => { toastListeners.add(setList); return () => toastListeners.delete(setList); }, []);
  return html`<div class="toasts" role="status" aria-live="polite">
    ${list.map((t) => html`<div class="toast" key=${t.id}>
      <span>${t.message}</span>
      ${t.action ? html`<button onClick=${() => { t.onAction?.(); setToasts(toasts.filter((x) => x.id !== t.id)); }}>${t.action}</button>` : null}
    </div>`)}
  </div>`;
}

// ---------------------------------------------------------------------
// 確認ダイアログ（Promise で結果を返す）
// ---------------------------------------------------------------------
let dialogSetter = null;
export function confirmDialog({ title, body, ok = 'OK', cancel = 'やめる', danger = false }) {
  return new Promise((resolve) => {
    if (!dialogSetter) { resolve(window.confirm(title)); return; }
    dialogSetter({ title, body, ok, cancel, danger, resolve });
  });
}
export function DialogHost() {
  const [d, setD] = useState(null);
  useEffect(() => { dialogSetter = setD; return () => { dialogSetter = null; }; }, []);
  const close = (v) => { d?.resolve(v); setD(null); };
  return html`<${Sheet} open=${!!d} onClose=${() => close(false)} title=${d?.title}>
    ${d?.body ? html`<div class="muted" style=${{ marginBottom: '16px' }}>${d.body}</div>` : null}
    <div class="row">
      <button class="btn grow" onClick=${() => close(false)}>${d?.cancel}</button>
      <button class=${'btn grow ' + (d?.danger ? 'danger' : 'primary')} onClick=${() => close(true)}>${d?.ok}</button>
    </div>
  <//>`;
}

// ---------------------------------------------------------------------
// クリップボード
// ---------------------------------------------------------------------
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* 無視 */ }
    ta.remove();
    return ok;
  }
}

export function SyncDot({ sync, pending, online, onClick }) {
  let cls = '', text = '';
  if (!online || sync.state === 'offline') { cls = 'offline'; text = pending ? `オフライン・${pending}件あとで送信` : 'オフライン'; }
  else if (sync.state === 'error') { cls = 'error'; text = '同期できません'; }
  else if (sync.state === 'syncing' || pending) { cls = 'syncing'; text = '同期中'; }
  return html`<button class=${'sync-dot ' + cls} onClick=${onClick} title=${sync.error ?? (text || '同期済み')} aria-label=${text || '同期済み'}>
    <span class="dot"></span>${text}
  </button>`;
}

export function TopBar({ title, sub, onBack, children }) {
  return html`<div class="topbar">
    ${onBack ? html`<button class="icon-btn" aria-label="戻る" onClick=${onBack}><${Icon} name="back" /></button>` : null}
    <h1>${title}${sub ? html`<div class="sub">${sub}</div>` : null}</h1>
    ${children}
  </div>`;
}
