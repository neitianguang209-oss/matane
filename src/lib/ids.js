const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

// 推測されにくいランダムID（部屋IDは16文字 ≒ 92ビット＝リンクを知らない人は開けない）
export function randomId(len = 16) {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHA[buf[i] % ALPHA.length];
  return s;
}
export const newRoomId = () => randomId(16);
export const newId = (prefix) => prefix + '_' + randomId(10);
// 1人1行だけのもの（本ごとのメモ、やりたいことへの「私も」）は、IDを決め打ちにして2人の書き込みがぶつからないようにする
export const noteId = (bookId, memberId) => `n_${bookId}_${memberId}`;
export const likeId = (wishId, memberId) => `l_${wishId}_${memberId}`;
