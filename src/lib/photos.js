// アイコンの写真：何枚も登録して、決まりに合わせて入れ替える
//   open  … アプリを開くたびにランダム
//   hour  … 1時間ごと（ふたりの画面で同じ写真になる）
//   day   … 1日ごと（同じく）
//   fixed … 選んだ1枚に固定
export const ROTATE_MODES = [
  { id: 'open', label: '開くたび' },
  { id: 'hour', label: '1時間ごと' },
  { id: 'day', label: '毎日' },
  { id: 'fixed', label: '固定' },
];

// 開くたびのランダム用（このページを開いている間は同じ）
const SESSION = Math.floor(Math.random() * 1e9);

export function hashStr(s) {
  let h = 2166136261;
  for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function pad(n) { return String(n).padStart(2, '0'); }
export function periodKey(mode, now = new Date()) {
  const d = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  if (mode === 'day') return d;
  if (mode === 'hour') return `${d}T${pad(now.getHours())}`;
  return 'open:' + SESSION;
}

// その人の写真の中から、今出す1枚を選ぶ（純粋な関数。tests.html でテスト）
export function pickPhoto(member, photos, now = new Date()) {
  if (!photos?.length) return null;
  const mode = member?.photoRotate ?? 'open';
  if (mode === 'fixed') return photos.find((p) => p.id === member.photoFixed) ?? photos[0];
  if (photos.length === 1) return photos[0];
  return photos[hashStr(member.id + '|' + periodKey(mode, now)) % photos.length];
}
