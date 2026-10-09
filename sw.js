// またね Service Worker（オフラインでもアプリを開けるように）
// アプリを更新して公開するたびに CACHE_NAME の番号を上げること
//
// ・アプリ自身のファイル … ネット優先（つながっていれば必ず最新。届かないときだけ端末の控えを使う）
//   ※ 前の版は「控え優先」だったため、ファイルごとに新旧が混ざって、相手の端末が古い版のまま止まることがあった
// ・ライブラリ(esm.sh)・フォント … 控え優先（版つきのURLなので中身が変わらない）
const CACHE_NAME = 'matane-v7';
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
  './src/lib/lock.js',
  './src/lib/logic.js',
  './src/lib/photos.js',
  './src/lib/pass.js',
  './src/lib/places.js',
  './src/lib/router.js',
  './src/lib/share.js',
  './src/lib/store.js',
  './src/lib/update.js',
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
  './src/ui/Rooms.js',
  './src/ui/Welcome.js',
  './src/ui/WishEditor.js',
  './src/ui/WishPage.js',
  './src/ui/WishTab.js',
  './src/ui/components.js',
  './src/ui/hooks.js',
  './src/ui/icons.js',
  './src/ui/lockui.js',
  './src/ui/photo.js',
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

  event.respondWith(sameOrigin ? networkFirst(req) : cacheFirst(req));
});

function save(req, res) {
  if (res && (res.ok || res.type === 'opaque')) {
    const clone = res.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
  }
  return res;
}

// ネット優先。4秒たっても返ってこなければ控えを出す（電波が弱いときに待たせない）
function networkFirst(req) {
  // ページそのもの(navigate)は Request に設定を足せないので URL で取り直す
  const net = (req.mode === 'navigate' ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(req, { cache: 'no-cache' })).then((res) => save(req, res));
  const fallback = () => caches.match(req, { ignoreSearch: true })
    .then((c) => c || (req.mode === 'navigate' ? caches.match(INDEX_URL) : undefined));
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => { fallback().then((c) => { if (c && !done) { done = true; resolve(c); } }); }, 4000);
    net.then((res) => { if (!done) { done = true; clearTimeout(timer); resolve(res); } })
      .catch(() => fallback().then((c) => { if (!done) { done = true; clearTimeout(timer); resolve(c || Response.error()); } }));
  });
}

function cacheFirst(req) {
  return caches.match(req).then((cached) => cached || fetch(req).then((res) => save(req, res)));
}
