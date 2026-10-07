// アイコンの写真：何枚も登録して、決まりに合わせて入れ替える
//   open  … タップするたび（見ている人がアイコンをタップすると次の1枚に。開き直しても変わらない）
//           ※ id は前の版の「開くたび」のまま（保存済みの設定をそのまま引き継ぐため）
//   hour  … 1時間ごと（ふたりの画面で同じ写真になる）
//   day   … 1日ごと（同じく）
//   fixed … 選んだ1枚に固定
export const ROTATE_MODES = [
  { id: 'open', label: 'タップするたび' },
  { id: 'hour', label: '1時間ごと' },
  { id: 'day', label: '毎日' },
  { id: 'fixed', label: '固定' },
];

export function hashStr(s) {
  let h = 2166136261;
  for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function pad(n) { return String(n).padStart(2, '0'); }
export function periodKey(mode, now = new Date()) {
  const d = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  if (mode === 'day') return d;
  return `${d}T${pad(now.getHours())}`;
}

// タップで入れ替わるか（2枚以上あって「タップするたび」）
export const tapRotates = (member, photos) => (photos?.length ?? 0) > 1 && (member?.photoRotate ?? 'open') === 'open';

// その人の写真の中から、今出す1枚を選ぶ（純粋な関数。tests.html でテスト）
//   taps … この端末でその人のアイコンをタップした回数（「タップするたび」のときだけ使う）
export function pickPhoto(member, photos, now = new Date(), taps = 0) {
  if (!photos?.length) return null;
  const mode = member?.photoRotate ?? 'open';
  if (mode === 'fixed') return photos.find((p) => p.id === member.photoFixed) ?? photos[0];
  if (photos.length === 1) return photos[0];
  if (mode === 'open') {
    // 人ごとに決まったシャッフル順で1枚ずつ進む（同じ写真が続かず、全部が順に出る）
    const order = photos.slice().sort((a, b) => hashStr(member.id + '|' + a.id) - hashStr(member.id + '|' + b.id));
    return order[((taps % order.length) + order.length) % order.length];
  }
  return photos[hashStr(member.id + '|' + periodKey(mode, now)) % photos.length];
}
