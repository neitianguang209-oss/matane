import { createRoot } from 'react-dom/client';
import { html } from './lib/html.js';
import { init } from './lib/store.js';
import { watchKeyboard } from './lib/keyboard.js';
import { applyHomeIcon } from './lib/homeicon.js';
import { App } from './ui/App.js';
import { toast } from './ui/components.js';

watchKeyboard();
await init();
await applyHomeIcon();
createRoot(document.getElementById('root')).render(html`<${App} />`);

// 新しい版を公開したとき：裏で入れ替わったら「更新」で読み込み直せるように知らせる
// （はじめて開いたときは古い版が無いので知らせない）
if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    toast('新しい版になりました ✦', { action: '更新', onAction: () => location.reload(), duration: 12000 });
  });
}
