// 「自分だけ」のメモの鍵（暗号化）
//
// ・鍵をかけたメモは、この端末の中で暗号にしてから送る。クラウドにも相手の端末にも暗号のまま届くので、
//   合言葉を知らない人（相手・運営者）には読めない。
// ・鍵は「自分だけの合言葉」から作る（PBKDF2 → AES-GCM 256bit）。合言葉そのものはどこにも保存しない。
// ・同じ合言葉なら別の端末でも同じ鍵になるよう、塩（salt）は自分のメンバー情報に入れて共有する。
// ・合言葉が合っているかは、メンバー情報の lockCheck（決まった言葉を暗号にしたもの）が解けるかで確かめる。
// ・一度合言葉を入れた端末は、鍵を端末の中（IndexedDB）に覚えておく。
import { kvGet, kvSet } from './store.js';

const ITER = 210000;
const CHECK = 'matane-lock-ok';
const keys = new Map();   // `${roomId}:${memberId}` -> CryptoKey

const enc = new TextEncoder();
const dec = new TextDecoder();
function b64(buf) {
  let s = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function unb64(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function newSalt() {
  const s = new Uint8Array(16);
  crypto.getRandomValues(s);
  return b64(s);
}
export async function deriveKey(passphrase, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(String(passphrase).normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: unb64(salt), iterations: ITER, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}
export async function encryptJSON(key, obj) {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return { v: 1, iv: b64(iv), ct: b64(ct) };
}
export async function decryptJSON(key, box) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.ct));
  return JSON.parse(dec.decode(pt));
}

// ---------------------------------------------------------------------
// 端末に覚えた鍵
// ---------------------------------------------------------------------
const kKey = (roomId, memberId) => `lock:${roomId}:${memberId}`;
export function getKey(roomId, memberId) {
  return keys.get(`${roomId}:${memberId}`) ?? null;
}
export async function loadKey(roomId, memberId) {
  const id = `${roomId}:${memberId}`;
  if (keys.has(id)) return keys.get(id);
  const k = await kvGet(kKey(roomId, memberId));
  if (k) keys.set(id, k);
  return k ?? null;
}
async function remember(roomId, memberId, key) {
  keys.set(`${roomId}:${memberId}`, key);
  await kvSet(kKey(roomId, memberId), key);   // CryptoKey はそのまま IndexedDB に入れられる（中身は取り出せない形）
  for (const f of listeners) f();
}
export async function forgetKey(roomId, memberId) {
  keys.delete(`${roomId}:${memberId}`);
  await kvSet(kKey(roomId, memberId), null);
  for (const f of listeners) f();
}
const listeners = new Set();
export const onKeyChange = (f) => { listeners.add(f); return () => listeners.delete(f); };

// 初めて合言葉を決める：塩と確認用の暗号を返す（メンバー情報に保存する）
export async function setupLock(roomId, memberId, passphrase) {
  const salt = newSalt();
  const key = await deriveKey(passphrase, salt);
  const lockCheck = await encryptJSON(key, CHECK);
  await remember(roomId, memberId, key);
  return { lockSalt: salt, lockCheck };
}
// 別の端末で合言葉を入れる：合っていれば true
export async function unlock(roomId, member, passphrase) {
  if (!member?.lockSalt || !member?.lockCheck) return false;
  const key = await deriveKey(passphrase, member.lockSalt);
  try {
    if ((await decryptJSON(key, member.lockCheck)) !== CHECK) return false;
  } catch { return false; }
  await remember(roomId, member.id, key);
  return true;
}

// ---------------------------------------------------------------------
// 読むとき：鍵のかかった行の中身を開いて覚えておく（画面は同期的に描くので、開いたら知らせる）
// ---------------------------------------------------------------------
const plainCache = new Map();   // `${id}|${updatedAt}` -> 中身
export function plainOf(item) {
  if (!item?.private || !item.enc) return item;
  const hit = plainCache.get(item.id + '|' + item.updatedAt);
  return hit ? { ...item, ...hit, _open: true } : null;
}
export async function openItem(roomId, item) {
  if (!item?.private || !item.enc) return item;
  const ck = item.id + '|' + item.updatedAt;
  if (plainCache.has(ck)) return { ...item, ...plainCache.get(ck), _open: true };
  const key = getKey(roomId, item.createdBy ?? item.memberId) ?? await loadKey(roomId, item.createdBy ?? item.memberId);
  if (!key) return null;
  try {
    const body = await decryptJSON(key, item.enc);
    plainCache.set(ck, body);
    for (const f of listeners) f();
    return { ...item, ...body, _open: true };
  } catch { return null; }
}
// 書くとき：中身を暗号にして、平文の欄は空にした行を返す
export async function sealItem(roomId, memberId, item, fields) {
  const key = getKey(roomId, memberId) ?? await loadKey(roomId, memberId);
  if (!key) throw new Error('nokey');
  const body = {};
  const blank = {};
  for (const f of fields) { body[f] = item[f] ?? null; blank[f] = null; }
  const box = await encryptJSON(key, body);
  return { ...item, ...blank, private: true, enc: box };
}
// 自分で書いた直後は、開くまで待たずにそのまま見えるように覚えておく
export function cachePlain(saved, body) {
  plainCache.set(saved.id + '|' + saved.updatedAt, body);
}
export const LOCK_CHECK = CHECK;
