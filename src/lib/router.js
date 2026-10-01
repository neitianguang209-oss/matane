import { React } from './html.js';

// ハッシュでの画面切り替え（GitHub Pages のサブパスでもそのまま動く）
//   #/                       … 最後にひらいた部屋（無ければ はじめに）
//   #/new                    … ふたりの部屋をつくる
//   #/r/<room>               … ホーム        /wish /cal /book /settings はタブ
//   #/r/<room>/w/<id|new>    … やりたいこと（/edit で編集）
//   #/r/<room>/p/<id|new>    … 会う日（/edit で編集）
//   #/r/<room>/b/<id>        … 読書会の本
export const TABS = ['home', 'wish', 'cal', 'book'];

export function parse(hash) {
  const raw = (hash || '').replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  const seg = path.split('/').filter(Boolean);
  if (!seg.length) return { name: 'root', query };
  if (seg[0] === 'new') return { name: 'create', query };
  if (seg[0] === 'r' && seg[1]) {
    const roomId = seg[1];
    const id = seg[3] === 'new' ? null : seg[3];
    if (seg[2] === 'w' && seg[3]) return { name: seg[4] === 'edit' || !id ? 'wishEdit' : 'wish', roomId, id, query };
    if (seg[2] === 'p' && seg[3]) return { name: seg[4] === 'edit' || !id ? 'planEdit' : 'plan', roomId, id, query };
    if (seg[2] === 'b' && seg[3]) return { name: 'book', roomId, id, query };
    if (seg[2] === 'settings') return { name: 'settings', roomId, query };
    const tab = TABS.includes(seg[2]) ? seg[2] : 'home';
    return { name: 'room', roomId, tab, query };
  }
  return { name: 'root', query };
}

let depth = 0; // アプリ内で進んだ回数（戻るでアプリの外に出ないように）

export function useRoute() {
  const [hash, setHash] = React.useState(location.hash);
  React.useEffect(() => {
    const f = () => setHash(location.hash);
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return React.useMemo(() => parse(hash), [hash]);
}

export function go(path, { replace = false } = {}) {
  const url = '#' + path;
  if (replace) {
    history.replaceState(null, '', url);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    depth++;
    location.hash = path;
  }
}

export function back(fallback = '/') {
  if (depth > 0) { depth--; history.back(); }
  else go(fallback, { replace: true });
}
