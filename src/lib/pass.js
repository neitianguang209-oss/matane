// 「部屋をつくれる人」のしくみ（パス）
//
// ・端末ごとに、ランダムなパス（id ＋ 合言葉 token）を1つ持つ。サーバーには token のハッシュだけ置く。
// ・新しい部屋をつくれるのは、オーナー（ひかる）と、オーナーが認めた人だけ（サーバー側の matane_push_batch で確かめる）。
// ・それ以外の人は「部屋をつくりたい」とお願いを送り、オーナーが承認するとつくれるようになる。
// ・オーナーは、同じ部屋の相手を設定画面から直接「つくれる人」にもできる（member.passIds で端末と人を結ぶ）。
// ・招待リンクで既存の部屋に入るのは、今までどおりだれでもできる。
import { React } from './html.js';
import { idb } from './idb.js';
import { supabase, wrap, NetError } from './api.js';
import { randomId } from './ids.js';

const K_PASS = 'pass';
let pass = null;                 // { id, token }
let st = { status: null, owner: null, checked: false, error: null, waiting: 0 };
const listeners = new Set();
const set = (patch) => { st = { ...st, ...patch }; for (const f of listeners) f(); };

export const currentPass = () => pass;
export const passState = () => st;
export const canCreate = (s = st) => s.status === 'owner' || s.status === 'ok';

async function rpc(name, args) {
  if (navigator.onLine === false) throw new NetError('offline', 'network');
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw wrap(error);
  return data;
}

export async function loadPass() {
  if (pass) return pass;
  try { pass = await idb.get(K_PASS); } catch { pass = null; }
  if (!pass?.id || !pass?.token) {
    pass = { id: randomId(16), token: randomId(32) };
    try { await idb.set(K_PASS, pass); } catch { /* 保存できない端末では毎回ちがうパスになる */ }
  }
  return pass;
}

// サーバーに名乗って、今の状態（つくれる？待ち？）を聞く
let checking = null;
export function checkPass(name) {
  if (checking) return checking;
  checking = (async () => {
    await loadPass();
    try {
      const res = await rpc('matane_pass_hello', { p_id: pass.id, p_token: pass.token, p_name: name ?? null });
      set({ status: res.status, owner: res.owner ?? null, checked: true, error: null });
      if (res.status === 'owner') refreshWaiting();
    } catch (err) {
      set({ checked: true, error: err.kind ?? 'server' });
    } finally {
      checking = null;
    }
    return st;
  })();
  return checking;
}

export async function requestPass(name, via) {
  await loadPass();
  const res = await rpc('matane_pass_request', { p_id: pass.id, p_token: pass.token, p_name: name, p_via: via ?? null });
  set({ status: res.status });
  return res.status;
}

export async function claimOwner(code) {
  await loadPass();
  await rpc('matane_pass_hello', { p_id: pass.id, p_token: pass.token, p_name: null });
  await rpc('matane_pass_owner', { p_id: pass.id, p_token: pass.token, p_code: code });
  await checkPass();
}

// ---- オーナーだけ ----
export async function listPasses() {
  await loadPass();
  const list = await rpc('matane_pass_admin', { p_id: pass.id, p_token: pass.token });
  set({ waiting: list.filter((x) => x.status === 'wait').length });
  return list;
}
export async function decidePass(target, status) {
  await loadPass();
  await rpc('matane_pass_decide', { p_id: pass.id, p_token: pass.token, p_target: target, p_status: status });
}
async function refreshWaiting() {
  try { await listPasses(); } catch { /* 次の機会に */ }
}

// 画面から：状態が変わったら描き直す
export function usePass() {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const f = () => force((n) => n + 1);
    listeners.add(f);
    return () => listeners.delete(f);
  }, []);
  return st;
}

// 開いたとき・戻ってきたときに確かめる（オーナーは承認待ちの数も）
export function watchPass(nameOf) {
  checkPass(nameOf());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkPass(nameOf());
  });
}
