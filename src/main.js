import { createRoot } from 'react-dom/client';
import { html } from './lib/html.js';
import { init, listRooms } from './lib/store.js';
import { loadPass, watchPass } from './lib/pass.js';
import { watchKeyboard } from './lib/keyboard.js';
import { applyHomeIcon } from './lib/homeicon.js';
import { App } from './ui/App.js';
import { toast } from './ui/components.js';

watchKeyboard();
await loadPass();
await init();
// 部屋をつくれるか（オーナーなら承認待ちの数も）を確かめておく。名前は最後にひらいた部屋の自分の名前
watchPass(() => { const s = listRooms()[0]; return s?.memberById.get(s.me)?.name ?? null; });
await applyHomeIcon();
createRoot(document.getElementById('root')).render(html`<${App} />`);

// 新しい版を公開したとき：裏で入れ替わったら「更新」で読み込み直せるように知らせる
// （はじめて開いたときは古い版が無いので知らせない）
if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    toast('新しい版になりました ✦', { action: '更新', onAction: () => location.reload(), duration: 12000 });
  });
}
