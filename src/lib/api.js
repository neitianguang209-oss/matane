import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from '../config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  realtime: { params: { eventsPerSecond: 5 } },
});

export class NetError extends Error {
  constructor(message, kind = 'network') { super(message); this.kind = kind; }
}

export function wrap(error) {
  const msg = String(error?.message ?? error ?? '');
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(msg)) return new NetError(msg, 'network');
  if (/room not found/i.test(msg)) return new NetError(msg, 'noroom');
  if (/not allowed to create/i.test(msg)) return new NetError(msg, 'denied');
  return new NetError(msg, 'server');
}

export async function rpcPull(roomId, since) {
  if (navigator.onLine === false) throw new NetError('offline', 'network');
  const { data, error } = await supabase.rpc('matane_pull', { p_room: roomId, p_since: since ?? null });
  if (error) throw wrap(error);
  return data;
}

export async function rpcPush(roomId, ops, pass = null) {
  if (navigator.onLine === false) throw new NetError('offline', 'network');
  const args = { p_room: roomId, p_ops: ops };
  if (pass) Object.assign(args, { p_pass: pass.id, p_pass_token: pass.token });
  const { data, error } = await supabase.rpc('matane_push_batch', args);
  if (error) throw wrap(error);
  return data;
}
