// ホーム画面のアイコン（この端末だけ）
// iPhone は「ホーム画面に追加」を押した瞬間の apple-touch-icon を使うので、
// 選んだアイコンをページのリンクに入れておく → そのあと追加すると、そのアイコンになる。
// 夜空（標準）・白い空・好きな写真 から選べる。写真は端末の中にだけ保存し、相手には送らない。
import { kvGet, kvSet } from './store.js';

export const HOME_ICONS = [
  { id: 'night', label: '夜空の虹', src: 'icons/icon-180.png', small: 'icons/icon-192.png' },
  { id: 'day', label: '白い空の虹', src: 'icons/day-180.png', small: 'icons/day-192.png' },
];

let current = { id: 'night' };

function setLink(rel, href) {
  let el = document.querySelector(`link[rel="${rel}"]`);
  if (!el) { el = document.createElement('link'); el.rel = rel; document.head.appendChild(el); }
  el.href = href;
}
function apply() {
  const preset = HOME_ICONS.find((x) => x.id === current.id);
  const big = current.id === 'photo' && current.data ? current.data : (preset ?? HOME_ICONS[0]).src;
  setLink('apple-touch-icon', big);
  setLink('icon', current.id === 'photo' && current.data ? current.data : (preset ?? HOME_ICONS[0]).small);
}

export async function applyHomeIcon() {
  try {
    const saved = await kvGet('homeIcon');
    if (saved?.id) current = saved;
  } catch { /* 標準のまま */ }
  apply();
}
// 画面に出すときのアイコン（ヘッダー・はじめの画面）
export function homeIconSrc() {
  if (current.id === 'photo' && current.data) return current.data;
  return (HOME_ICONS.find((x) => x.id === current.id) ?? HOME_ICONS[0]).small;
}
export const homeIconId = () => current.id;
export async function setHomeIcon(next) {
  current = next;
  apply();
  await kvSet('homeIcon', next);
}
