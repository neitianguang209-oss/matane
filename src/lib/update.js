// 新しい版が出ていたら、確実に入れ替える。
//
// Service Worker の更新だけに頼ると、iPhone のホーム画面アプリは閉じずに裏で生き続けるので、
// 何日も古い版のままになることがある。そこで開いたとき・戻ってきたときに version.json を見て、
// 自分より新しければ控え(キャッシュ)を捨てて読み込み直す。
import { APP_VERSION } from '../config.js';

const newer = (a, b) => {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
};

let lastCheck = 0;
export async function checkForUpdate({ onUpdating } = {}) {
  if (location.hostname === 'localhost' || navigator.onLine === false) return;
  if (Date.now() - lastCheck < 60000) return;
  lastCheck = Date.now();
  try {
    const res = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    const { version } = await res.json();
    if (!newer(version, APP_VERSION)) return;
    // 同じ版への読み込み直しは1回だけ（うまく入れ替わらなくても、ぐるぐる回らないように）
    const key = 'matane.updatedTo';
    try { if (sessionStorage.getItem(key) === version) return; sessionStorage.setItem(key, version); } catch { /* 無くても動く */ }
    onUpdating?.(version);
    const reg = await navigator.serviceWorker?.getRegistration();
    try { await reg?.update(); } catch { /* 次の機会に */ }
    if (window.caches) for (const k of await caches.keys()) if (k.startsWith('matane')) await caches.delete(k);
    location.reload();
  } catch { /* オフラインなど。次の機会に */ }
}

export function watchUpdates(opts) {
  checkForUpdate(opts);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkForUpdate(opts);
      navigator.serviceWorker?.getRegistration().then((r) => r?.update()).catch(() => {});
    }
  });
}
