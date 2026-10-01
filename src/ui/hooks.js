import { React } from '../lib/html.js';
import { subscribe, getVersion, getRoom, getSync, pendingCount } from '../lib/store.js';
import { todayStr } from '../lib/dates.js';

export function useStore() {
  return React.useSyncExternalStore(subscribe, getVersion);
}

export function useRoom(roomId) {
  useStore();
  return { snap: getRoom(roomId), sync: getSync(roomId), pending: pendingCount(roomId) };
}

export function useOnline() {
  const [on, setOn] = React.useState(navigator.onLine !== false);
  React.useEffect(() => {
    const a = () => setOn(true);
    const b = () => setOn(false);
    window.addEventListener('online', a);
    window.addEventListener('offline', b);
    return () => { window.removeEventListener('online', a); window.removeEventListener('offline', b); };
  }, []);
  return on;
}

// 日付が変わったら描き直す（開きっぱなしでも「あと◯日」がずれないように）
export function useToday() {
  const [t, setT] = React.useState(todayStr());
  React.useEffect(() => {
    const check = () => { const n = todayStr(); if (n !== t) setT(n); };
    const id = setInterval(check, 60000);
    document.addEventListener('visibilitychange', check);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', check); };
  }, [t]);
  return t;
}

// ふたりのうち「自分」と「相手」
export function usePair(snap) {
  const me = snap?.me ? snap.memberById.get(snap.me) : null;
  const other = snap?.members.find((m) => m.id !== snap.me) ?? null;
  return { me, other };
}
