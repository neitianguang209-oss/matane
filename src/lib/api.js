import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from '../config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  realtime: { params: { eventsPerSecond: 5 } },
});

export class NetError extends Error {
  constructor(message, kind = 'network') { super(message); this.kind = kind; }
}

function wrap(error) {
  const msg = String(error?.message ?? error ?? '');
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(msg)) return new NetError(msg, 'network');
  if (/room not found/i.test(msg)) return new NetError(msg, 'noroom');
  return new NetError(msg, 'server');
}

export async function rpcPull(roomId, since) {
  if (navigator.onLine === false) throw new NetError('offline', 'network');
  const { data, error } = await supabase.rpc('matane_pull', { p_room: roomId, p_since: since ?? null });
  if (error) throw wrap(error);
  return data;
}

export async function rpcPush(roomId, ops) {
  if (navigator.onLine === false) throw new NetError('offline', 'network');
  const { data, error } = await supabase.rpc('matane_push_batch', { p_room: roomId, p_ops: ops });
  if (error) throw wrap(error);
  return data;
}
