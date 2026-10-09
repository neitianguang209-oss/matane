import { createRoot } from 'react-dom/client';
import { html } from './lib/html.js';
import { init, listRooms } from './lib/store.js';
import { loadPass, watchPass } from './lib/pass.js';
import { watchKeyboard } from './lib/keyboard.js';
import { applyHomeIcon } from './lib/homeicon.js';
import { watchUpdates } from './lib/update.js';
import { App } from './ui/App.js';
import { toast } from './ui/components.js';

watchKeyboard();
await loadPass();
await init();
// 部屋をつくれるか（オーナーなら承認待ちの数も）を確かめておく。名前は最後にひらいた部屋の自分の名前
watchPass(() => { const s = listRooms()[0]; return s?.memberById.get(s.me)?.name ?? null; });
await applyHomeIcon();
createRoot(document.getElementById('root')).render(html`<${App} />`);

// 新しい版が出ていたら、開いたとき・戻ってきたときに自動で入れ替える（データは端末とクラウドに保存済みなので消えない）
watchUpdates({ onUpdating: () => toast('新しい版に更新しています…', { duration: 4000 }) });

// Service Worker が裏で入れ替わったとき：見ていなければそのまま読み込み直す。見ているときは「更新」で
if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (document.visibilityState === 'hidden') { location.reload(); return; }
    toast('新しい版になりました ✦', { action: '更新', onAction: () => location.reload(), duration: 12000 });
  });
}
