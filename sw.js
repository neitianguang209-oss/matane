// またね Service Worker（オフラインでもアプリを開けるように）
// アプリを更新して公開するたびに CACHE_NAME の番号を上げること（上げないと古い画面が出続ける）
const CACHE_NAME = 'matane-v2';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './styles.css',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/favicon-32.png',
  './icons/day-180.png',
  './icons/day-192.png',
  './src/config.js',
  './src/lib/api.js',
  './src/lib/books.js',
  './src/lib/dates.js',
  './src/lib/emoji.js',
  './src/lib/holidays.js',
  './src/lib/homeicon.js',
  './src/lib/html.js',
  './src/lib/idb.js',
  './src/lib/ids.js',
  './src/lib/keyboard.js',
  './src/lib/logic.js',
  './src/lib/places.js',
  './src/lib/router.js',
  './src/lib/share.js',
  './src/lib/store.js',
  './src/main.js',
  './src/ui/App.js',
  './src/ui/BookAdd.js',
  './src/ui/BookPage.js',
  './src/ui/BookTab.js',
  './src/ui/CalendarTab.js',
  './src/ui/Dice.js',
  './src/ui/HomeTab.js',
  './src/ui/PlanEditor.js',
  './src/ui/PlanPage.js',
  './src/ui/Room.js',
  './src/ui/RoomGate.js',
  './src/ui/Settings.js',
  './src/ui/Welcome.js',
  './src/ui/WishEditor.js',
  './src/ui/WishPage.js',
  './src/ui/WishTab.js',
  './src/ui/components.js',
  './src/ui/hooks.js',
  './src/ui/icons.js',
  './src/ui/rows.js',
].map((p) => new URL(p, self.registration.scope).toString());

const INDEX_URL = new URL('./index.html', self.registration.scope).toString();
// 自分のファイルと、ライブラリ(esm.sh)・フォントだけキャッシュする。DB・本の検索・祝日の通信は素通し
const CACHEABLE_HOSTS = ['esm.sh', 'fonts.gstatic.com', 'fonts.googleapis.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !CACHEABLE_HOSTS.includes(url.hostname)) return;
  if (sameOrigin && !url.href.startsWith(self.registration.scope)) return;

  event.respondWith(
    caches.match(req, { ignoreSearch: sameOrigin }).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => {
          if (req.mode === 'navigate') return caches.match(INDEX_URL);
          return cached;
        });
      return cached || fetchPromise;
    }),
  );
});
