// 日本の祝日（カレンダーを赤くするだけ。取れなくてもアプリは困らない）
// https://holidays-jp.github.io/ … 去年〜来年の祝日を返す。端末に30日キャッシュする。
import { React } from './html.js';
import { kvGet, kvSet } from './store.js';

let cache = null;
let loading = null;
const subs = new Set();

async function load() {
  if (loading) return loading;
  loading = (async () => {
    const saved = await kvGet('holidays');
    if (saved?.data) { cache = saved.data; subs.forEach((f) => f()); }
    if (saved?.at && Date.now() - saved.at < 30 * 864e5) return;
    try {
      const res = await fetch('https://holidays-jp.github.io/api/v1/date.json');
      if (!res.ok) return;
      const data = await res.json();
      if (data && typeof data === 'object' && Object.keys(data).length) {
        cache = data;
        kvSet('holidays', { at: Date.now(), data });
        subs.forEach((f) => f());
      }
    } catch { /* オフラインなら前回のまま */ }
  })();
  return loading;
}

export function useHolidays() {
  const [, force] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => {
    subs.add(force);
    load();
    return () => subs.delete(force);
  }, []);
  return cache ?? {};
}
