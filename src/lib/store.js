// データの置き場所と同期。
//
// ・ローカルファースト：画面はいつも端末内(IndexedDB)のデータで動く。電波が無くても書ける。
// ・変更は「送信待ち(outbox)」にためて、つながったらまとめてクラウドへ送る。
// ・クラウドからは差分だけ取り込む。送信待ちの行は端末側を優先（自分の変更を巻き戻さない）。
// ・クラウドに部屋が無い（消えた）のに端末に記録があれば、端末の記録からクラウドを復元する。
//   端末のデータを「クラウドが空だから」という理由で消すことは絶対にしない。
// ・どちらかが保存したら Realtime のブロードキャストで相手の画面にすぐ知らせる（保険で30秒ごとにも確認）。
import { idb } from './idb.js';
import { rpcPull, rpcPush, supabase } from './api.js';
import { newRoomId, newId } from './ids.js';
import { pickPhoto, periodKey, tapRotates } from './photos.js';
import { currentPass } from './pass.js';

const K_INDEX = 'index';
const K_OUTBOX = 'outbox';
const kRoom = (id) => 'r:' + id;
const kMe = (id) => 'me:' + id;
const kSeen = (id) => 'seen:' + id;
const nowIso = () => new Date().toISOString();
const ts = (x) => Date.parse(x?.updatedAt ?? '') || 0;

const S = {
  index: [],            // [{ id, openedAt, addedAt }]
  rooms: new Map(),     // id -> { room, items: Map, cursor }
  outbox: [],           // [{ roomId, kind:'room'|'item', id, data }]
  sync: new Map(),      // id -> { state, lastSync, error, restored }
  me: new Map(),        // roomId -> memberId（この端末では誰か）
  seenBefore: new Map(),// roomId -> 前回ひらいた時刻（相手の新着に印をつける）
  storageOk: true,
  taps: {},             // memberId -> この端末でアイコンをタップした回数（「タップするたび」の写真用）
};

// ---------------------------------------------------------------------
// 変更通知（React からは useSyncExternalStore で購読）
// ---------------------------------------------------------------------
let version = 0;
const listeners = new Set();
const snapCache = new Map();
function emit() {
  version++;
  snapCache.clear();
  for (const f of listeners) f();
}
export const subscribe = (f) => { listeners.add(f); return () => listeners.delete(f); };
export const getVersion = () => version;

// 相手が何かを追加したときの知らせ（画面側でトーストにする）
const newsListeners = new Set();
export const onNews = (f) => { newsListeners.add(f); return () => newsListeners.delete(f); };

// ---------------------------------------------------------------------
// 端末への保存
// ---------------------------------------------------------------------
const saveTimers = new Map();
function persistRoom(id) {
  clearTimeout(saveTimers.get(id));
  saveTimers.set(id, setTimeout(() => {
    const e = S.rooms.get(id);
    if (!e) return;
    idb.set(kRoom(id), { room: e.room, items: [...e.items.values()], cursor: e.cursor }).catch(storageFailed);
  }, 120));
}
const persistIndex = () => idb.set(K_INDEX, S.index).catch(storageFailed);
const persistOutbox = () => idb.set(K_OUTBOX, S.outbox).catch(storageFailed);
function storageFailed(err) {
  console.warn('storage', err);
  if (S.storageOk) { S.storageOk = false; emit(); }
}
export const storageOk = () => S.storageOk;

function hydrate(raw) {
  return {
    room: raw?.room ?? null,
    items: new Map((raw?.items ?? []).map((x) => [x.id, x])),
    cursor: raw?.cursor ?? null,
  };
}
function entry(id) {
  let e = S.rooms.get(id);
  if (!e) { e = hydrate(null); S.rooms.set(id, e); }
  return e;
}
function touchIndex(id) {
  const now = Date.now();
  const it = S.index.find((x) => x.id === id);
  if (it) it.openedAt = now;
  else S.index.push({ id, openedAt: now, addedAt: now });
  persistIndex();
}

// ---------------------------------------------------------------------
// 起動
// ---------------------------------------------------------------------
export async function init() {
  try {
    S.index = (await idb.get(K_INDEX)) ?? [];
    S.outbox = (await idb.get(K_OUTBOX)) ?? [];
    S.taps = (await idb.get('taps')) ?? {};
    for (const it of S.index) {
      S.rooms.set(it.id, hydrate(await idb.get(kRoom(it.id))));
      const me = await idb.get(kMe(it.id));
      if (me) S.me.set(it.id, me);
    }
  } catch (err) {
    storageFailed(err);
  }
  window.addEventListener('online', () => { flushAll(); pullOpen(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { flushAll(); pullOpen(); }
  });
  setInterval(() => { if (document.visibilityState === 'visible') { pullOpen(); if (S.outbox.length) flushAll(); } }, 30000);
  // 「1時間ごと」「毎日」のアイコンは、時間が変わったら描き直す
  let lastHour = periodKey('hour');
  setInterval(() => { const h = periodKey('hour'); if (h !== lastHour) { lastHour = h; emit(); } }, 60000);
  try { navigator.storage?.persist?.(); } catch { /* 無くても動く */ }
  flushAll();
  emit();
}

// ---------------------------------------------------------------------
// 読み出し
// ---------------------------------------------------------------------
const byOrder = (a, b) => ((a.order ?? 0) - (b.order ?? 0)) || String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? ''));

export function getRoom(id) {
  if (!id) return null;
  if (snapCache.has(id)) return snapCache.get(id);
  const e = S.rooms.get(id);
  if (!e) return null;
  const live = { member: [], wish: [], plan: [], book: [], note: [], like: [], memo: [], photo: [] };
  for (const x of e.items.values()) {
    if (x.deleted || !live[x.kind]) continue;
    live[x.kind].push(x);
  }
  // メンバーに「今出すアイコン」を添える（_ で始まる欄は保存しない）
  const photos = live.photo.filter((p) => p.data).sort(byOrder);
  const members = live.member.sort(byOrder).map((m) => {
    const mine = photos.filter((p) => p.memberId === m.id);
    const cur = pickPhoto(m, mine, new Date(), S.taps[m.id] ?? 0);
    return { ...m, _photos: mine, _photo: cur?.data ?? m.photo ?? null, _photoId: cur?.id ?? null };
  });
  const snap = {
    id,
    room: e.room,
    members,
    memberById: new Map(members.map((m) => [m.id, m])),
    wishes: live.wish,
    wishById: new Map(live.wish.map((w) => [w.id, w])),
    plans: live.plan,
    planById: new Map(live.plan.map((p) => [p.id, p])),
    books: live.book,
    bookById: new Map(live.book.map((b) => [b.id, b])),
    notes: live.note,
    likes: live.like,
    memos: live.memo.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))),
    photos,
    me: S.me.get(id) ?? null,
    seenBefore: S.seenBefore.get(id) ?? null,
  };
  snapCache.set(id, snap);
  return snap;
}
export function getItem(roomId, id) {
  return S.rooms.get(roomId)?.items.get(id) ?? null;
}
export function listRooms() {
  return S.index
    .slice()
    .sort((a, b) => b.openedAt - a.openedAt)
    .map((it) => getRoom(it.id))
    .filter((s) => s && s.room);
}
export const getSync = (id) => S.sync.get(id) ?? { state: 'idle' };
export const pendingCount = (id) => S.outbox.filter((o) => !id || o.roomId === id).length;
function setSync(id, patch) {
  S.sync.set(id, { ...getSync(id), ...patch });
  emit();
}

// アイコンをタップしたら次の写真へ（「タップするたび」の人だけ。この端末だけの記憶）
// 入れ替わった人がいれば true
export function nextPhoto(roomId, memberIds) {
  const snap = getRoom(roomId);
  let moved = false;
  for (const id of memberIds) {
    const m = snap?.memberById.get(id);
    if (!m || !tapRotates(m, m._photos)) continue;
    S.taps = { ...S.taps, [id]: (S.taps[id] ?? 0) + 1 };
    moved = true;
  }
  if (moved) { idb.set('taps', S.taps).catch(() => {}); emit(); }
  return moved;
}

// この端末で「自分」はどちらか（端末ごと・部屋ごと）
export const getMe = (roomId) => S.me.get(roomId) ?? null;
export function setMe(roomId, memberId) {
  if (memberId) S.me.set(roomId, memberId);
  else S.me.delete(roomId);
  (memberId ? idb.set(kMe(roomId), memberId) : idb.del(kMe(roomId))).catch(storageFailed);
  emit();
}

// ---------------------------------------------------------------------
// 変更
// ---------------------------------------------------------------------
function enqueue(roomId, kind, data) {
  const i = S.outbox.findIndex((o) => o.roomId === roomId && o.kind === kind && o.id === data.id);
  const op = { roomId, kind, id: data.id, data };
  if (i >= 0) S.outbox[i] = op;
  else S.outbox.push(op);
  persistOutbox();
  scheduleFlush();
}

export function createRoom({ myName, friendName }) {
  const id = newRoomId();
  const t = nowIso();
  const e = entry(id);
  e.room = { id, bookClub: { perMonth: 2 }, createdAt: t, updatedAt: t };
  e.cursor = null;
  enqueue(id, 'room', e.room);
  const pid = currentPass()?.id;
  const me = { kind: 'member', id: newId('m'), name: myName.trim(), color: 0, order: 0, passIds: pid ? [pid] : [], createdAt: t, updatedAt: t };
  const friend = {
    kind: 'member', id: newId('m'), name: friendName.trim() || 'ともだち', placeholder: !friendName.trim(),
    color: 1, order: 1, createdAt: t, updatedAt: t,
  };
  for (const m of [me, friend]) { e.items.set(m.id, m); enqueue(id, 'item', m); }
  touchIndex(id);
  persistRoom(id);
  setMe(id, me.id);
  return id;
}

export function updateRoom(id, patch) {
  const e = entry(id);
  if (!e.room) return;
  e.room = { ...e.room, ...patch, updatedAt: nowIso() };
  enqueue(id, 'room', e.room);
  persistRoom(id);
  emit();
}

// 追加・変更（kind と id は呼ぶ側で決める。id が無ければ新しく作る）
export function saveItem(roomId, x) {
  const e = entry(roomId);
  const t = nowIso();
  const prev = x.id ? e.items.get(x.id) : null;
  const me = getMe(roomId);
  const prefix = { member: 'm', wish: 'w', plan: 'p', book: 'b', memo: 'f', photo: 'ph' }[x.kind] ?? 'x';
  // 画面用に添えた欄（_photo など）は保存しない
  const clean = Object.fromEntries(Object.entries(x).filter(([k]) => !k.startsWith('_')));
  const xx = {
    ...prev,
    ...clean,
    id: x.id ?? newId(prefix),
    createdAt: prev?.createdAt ?? x.createdAt ?? t,
    createdBy: prev?.createdBy ?? x.createdBy ?? me ?? null,
    updatedBy: me ?? null,
    updatedAt: t,
  };
  e.items.set(xx.id, xx);
  enqueue(roomId, 'item', xx);
  persistRoom(roomId);
  emit();
  return xx;
}

// 削除は「消した印」を付けるだけ。戻す関数を返す
export function deleteItem(roomId, id) {
  const cur = getItem(roomId, id);
  if (!cur) return () => {};
  saveItem(roomId, { ...cur, deleted: true });
  return () => {
    const now = getItem(roomId, id);
    if (now) saveItem(roomId, { ...now, deleted: false });
  };
}

// この端末の一覧から外す（クラウドのデータは消さない。リンクからまた開ける）
export async function forgetRoom(id) {
  S.index = S.index.filter((x) => x.id !== id);
  persistIndex();
  if (!S.outbox.some((o) => o.roomId === id)) {
    S.rooms.delete(id);
    idb.del(kRoom(id)).catch(() => {});
  }
  closeRoom(id);
  emit();
}

// バックアップ(JSON)を書き出す／取り込む
export function exportRoom(id) {
  const e = S.rooms.get(id);
  if (!e?.room) return null;
  return { format: 'matane', version: 1, exportedAt: nowIso(), room: e.room, items: [...e.items.values()] };
}
export function importRoom(json) {
  if (!json || json.format !== 'matane' || !json.room?.id) throw new Error('「またね」のバックアップファイルではないようです');
  const id = json.room.id;
  const e = entry(id);
  if (!e.room || ts(json.room) >= ts(e.room)) e.room = json.room;
  for (const x of json.items ?? []) {
    const cur = e.items.get(x.id);
    if (!cur || ts(x) >= ts(cur)) e.items.set(x.id, x);
  }
  // クラウドにも送る（クラウド側は新しいほうだけ残すので、上書き事故は起きない）
  enqueueAll(id);
  touchIndex(id);
  persistRoom(id);
  emit();
  return id;
}
function enqueueAll(id) {
  const e = S.rooms.get(id);
  if (!e?.room) return;
  enqueue(id, 'room', e.room);
  for (const x of e.items.values()) enqueue(id, 'item', x);
}

// ---------------------------------------------------------------------
// 同期：送る
// ---------------------------------------------------------------------
let flushing = false;
let flushAgain = false;
let flushTimer = null;
let retryTimer = null;
function scheduleFlush(ms = 250) {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flushAll, ms);
}
export async function flushAll() {
  if (flushing) { flushAgain = true; return; }
  if (!S.outbox.length) return;
  flushing = true;
  try {
    const ids = [...new Set(S.outbox.map((o) => o.roomId))];
    for (const rid of ids) await flushRoom(rid, 0);
  } finally {
    flushing = false;
    if (flushAgain) { flushAgain = false; scheduleFlush(50); }
  }
}
async function flushRoom(rid, depth) {
  // 部屋 → メンバー → その他 の順で送る（部屋が無いと中身を受け付けないため）
  const rank = (o) => (o.kind === 'room' ? 0 : o.data?.kind === 'member' ? 1 : 2);
  // 写真は大きいので、1回に送る量を 1.5MB くらいまでにする
  const all = S.outbox.filter((o) => o.roomId === rid).sort((a, b) => rank(a) - rank(b));
  const ops = [];
  let size = 0;
  for (const o of all) {
    const n = (o.data?.data?.length ?? 0) + 2000;
    if (ops.length && (ops.length >= 200 || size + n > 1500000)) break;
    ops.push(o);
    size += n;
  }
  if (!ops.length) return;
  setSync(rid, { state: 'syncing' });
  try {
    // 部屋そのものを送るときは「部屋をつくれる人」の印も添える（新しい部屋はこれが無いと受け付けない）
    const pass = ops.some((o) => o.kind === 'room') ? currentPass() : null;
    await rpcPush(rid, ops.map((o) => ({ kind: o.kind, data: o.data })), pass);
    S.outbox = S.outbox.filter((o) => !ops.includes(o));
    persistOutbox();
    setSync(rid, { state: 'idle', lastSync: Date.now(), error: null });
    broadcast(rid);
    if (S.outbox.some((o) => o.roomId === rid) && depth < 20) await flushRoom(rid, depth + 1);
  } catch (err) {
    // クラウドに部屋が無い → 部屋そのものを先頭に入れて送り直す（復元）
    if (err.kind === 'noroom' && depth < 2) {
      const e = S.rooms.get(rid);
      if (e?.room) {
        S.outbox = S.outbox.filter((o) => !(o.roomId === rid && o.kind === 'room'));
        S.outbox.unshift({ roomId: rid, kind: 'room', id: rid, data: e.room });
        persistOutbox();
        return flushRoom(rid, depth + 1);
      }
    }
    setSync(rid, { state: err.kind === 'network' ? 'offline' : 'error', error: String(err.message ?? err) });
    clearTimeout(retryTimer);
    retryTimer = setTimeout(flushAll, err.kind === 'network' ? 20000 : 60000);
  }
}

// ---------------------------------------------------------------------
// 同期：受け取る
// ---------------------------------------------------------------------
const pulling = new Map();
export function pull(rid) {
  if (pulling.has(rid)) return pulling.get(rid);
  const p = (async () => {
    const e = entry(rid);
    // 同時刻に書かれた行の取りこぼしを防ぐため、しおりは15秒さかのぼって重ねて取る
    const since = e.cursor ? new Date(Date.parse(e.cursor) - 15000).toISOString() : null;
    if (!e.room) setSync(rid, { state: 'syncing' });
    try {
      const res = await rpcPull(rid, since);
      if (!res?.found) {
        if (e.room) {
          // クラウドに部屋が無い。端末の記録から送り直す（端末側は消さない）。
          enqueueAll(rid);
          if (e.cursor) setSync(rid, { restored: true });
          flushAll();
        } else {
          setSync(rid, { state: 'notfound' });
        }
        return;
      }
      merge(rid, res, !!e.cursor);
      e.cursor = res.now;
      persistRoom(rid);
      if (e.room && !S.index.some((x) => x.id === rid)) touchIndex(rid);
      const st = getSync(rid).state;
      setSync(rid, {
        state: pendingCount(rid) ? (st === 'offline' || st === 'error' ? st : 'syncing') : 'idle',
        lastSync: Date.now(),
        error: null,
      });
    } catch (err) {
      setSync(rid, { state: err.kind === 'network' ? 'offline' : 'error', error: String(err.message ?? err) });
    } finally {
      pulling.delete(rid);
    }
  })();
  pulling.set(rid, p);
  return p;
}

function merge(rid, res, announce) {
  const e = entry(rid);
  const pending = new Set(S.outbox.filter((o) => o.roomId === rid).map((o) => o.kind + ':' + o.id));
  const me = getMe(rid);
  const news = [];
  let changed = false;
  if (res.room && !pending.has('room:' + rid) && (!e.room || ts(res.room) >= ts(e.room))) {
    e.room = res.room;
    changed = true;
  }
  for (const x of res.items ?? []) {
    if (pending.has('item:' + x.id)) continue;
    const cur = e.items.get(x.id);
    if (!cur || ts(x) >= ts(cur)) {
      if (announce && !cur && !x.deleted && x.createdBy && x.createdBy !== me) news.push(x);
      e.items.set(x.id, x);
      changed = true;
    }
  }
  if (changed) emit();
  if (news.length) for (const f of newsListeners) f(rid, news);
}

// ---------------------------------------------------------------------
// 開いている部屋：リアルタイム通知
// ---------------------------------------------------------------------
const openSet = new Set();
const channels = new Map();
function pullOpen() { for (const rid of openSet) pull(rid); }

export async function openRoom(rid) {
  openSet.add(rid);
  if (entry(rid).room) touchIndex(rid);
  // 前回ひらいた時刻を覚えておき、それ以降に相手が足したものに「NEW」を付ける
  if (!S.seenBefore.has(rid)) {
    try {
      S.seenBefore.set(rid, (await idb.get(kSeen(rid))) ?? null);
      idb.set(kSeen(rid), nowIso()).catch(() => {});
    } catch { /* 印が付かないだけ */ }
    emit();
  }
  pull(rid).then(() => flushAll());
  if (!channels.has(rid)) {
    try {
      const ch = supabase.channel('matane-' + rid, { config: { broadcast: { self: false } } });
      ch.on('broadcast', { event: 'changed' }, () => pull(rid)).subscribe();
      channels.set(rid, ch);
    } catch { /* 30秒ごとの確認で追いつく */ }
  }
}
export function closeRoom(rid) {
  openSet.delete(rid);
  const ch = channels.get(rid);
  if (ch) { try { supabase.removeChannel(ch); } catch { /* 無視 */ } channels.delete(rid); }
}
function broadcast(rid) {
  const ch = channels.get(rid);
  if (!ch) return;
  try { ch.send({ type: 'broadcast', event: 'changed', payload: { at: Date.now() } }); } catch { /* 無視 */ }
}

// ---------------------------------------------------------------------
// ちょっとした端末ごとの記憶（祝日のキャッシュなど）
// ---------------------------------------------------------------------
export const kvGet = (k) => idb.get('kv:' + k).catch(() => null);
export const kvSet = (k, v) => idb.set('kv:' + k, v).catch(() => {});
