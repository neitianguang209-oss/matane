-- =====================================================================
-- またね（ふたりの「いつか」と会う日のノート）  Supabase スキーマ
--
-- 既存プロジェクト gzayrjlhruhvklsidraw に相乗り。テーブルは matane_ 接頭辞。
--
-- ログインは無し。ふたりの部屋ごとのランダムなID（16文字）が「合言葉」になる。
-- テーブルは anon から直接は読めないように閉じ、IDを知っている人だけが
-- 下の関数（matane_pull / matane_push_batch）経由で読み書きできる。
--
-- 部屋の中身（メンバー・やりたいこと・会う日・読書会の本・メモ・「私も」）は
-- すべて matane_items に kind 付きの jsonb で持つ（項目を足してもDB変更が要らない）。
-- updated_at は端末側の更新時刻で、新しいほうだけが残る（後勝ち）。
-- synced_at はサーバーに届いた時刻で、差分取得のしおりに使う。
-- 削除は deleted フラグ（ソフト削除）だけ。物理削除はしない。
-- =====================================================================

create table if not exists public.matane_rooms (
  id          text primary key check (id ~ '^[A-Za-z0-9]{12,32}$'),
  data        jsonb not null,
  updated_at  timestamptz not null,
  synced_at   timestamptz not null default now()
);

create table if not exists public.matane_items (
  room_id     text not null references public.matane_rooms(id) on delete cascade,
  id          text not null check (id ~ '^[A-Za-z0-9_-]{4,48}$'),
  kind        text not null check (kind in ('member', 'wish', 'plan', 'book', 'note', 'like')),
  data        jsonb not null,
  deleted     boolean not null default false,
  updated_at  timestamptz not null,
  synced_at   timestamptz not null default now(),
  primary key (room_id, id)
);

create index if not exists matane_items_sync_idx on public.matane_items (room_id, synced_at);

-- バックアップ用の合言葉のハッシュなど
create table if not exists public.matane_secret (
  k           text primary key,
  v           text not null,
  updated_at  timestamptz not null default now()
);

alter table public.matane_rooms  enable row level security;
alter table public.matane_items  enable row level security;
alter table public.matane_secret enable row level security;
-- ポリシーは作らない ＝ anon / authenticated からは直接読めない・書けない
revoke all on public.matane_rooms, public.matane_items, public.matane_secret from anon, authenticated;


-- ---------------------------------------------------------------------
-- 差分の取得。p_since より後にサーバーへ届いた行だけ返す（null なら全部）。
-- 部屋が無ければ found=false（端末側に記録があれば、端末からの復元に使う）。
-- ---------------------------------------------------------------------
create or replace function public.matane_pull(p_room text, p_since timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  r public.matane_rooms%rowtype;
begin
  if p_room is null or p_room !~ '^[A-Za-z0-9]{12,32}$' then
    raise exception 'bad room id';
  end if;
  select * into r from public.matane_rooms where id = p_room;
  if not found then
    return jsonb_build_object('found', false, 'now', now());
  end if;
  return jsonb_build_object(
    'found', true,
    'now', now(),
    'room', case when p_since is null or r.synced_at > p_since then r.data end,
    'items', coalesce((
      select jsonb_agg(i.data || jsonb_build_object('kind', i.kind, 'deleted', i.deleted) order by i.synced_at)
      from public.matane_items i
      where i.room_id = p_room and (p_since is null or i.synced_at > p_since)
    ), '[]'::jsonb)
  );
end;
$$;


-- ---------------------------------------------------------------------
-- まとめて書き込み。p_ops は [{kind:'room'|'item', data:{id, kind?, updatedAt, deleted?, ...}}]
-- 端末がオフラインの間にためた変更も、つながったときにこれ1回で送る。
-- 同じ行は updatedAt が新しいほうだけ残る（古い変更が後から届いても上書きしない）。
-- ---------------------------------------------------------------------
create or replace function public.matane_push_batch(p_room text, p_ops jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  op        jsonb;
  d         jsonb;
  k         text;
  ik        text;
  rid       text;
  ts        timestamptz;
  v_now     timestamptz := clock_timestamp();
  n_applied integer := 0;
begin
  if p_room is null or p_room !~ '^[A-Za-z0-9]{12,32}$' then
    raise exception 'bad room id';
  end if;
  if jsonb_typeof(p_ops) <> 'array' or jsonb_array_length(p_ops) > 500 then
    raise exception 'bad ops';
  end if;

  for op in select * from jsonb_array_elements(p_ops) loop
    k := op->>'kind';
    d := op->'data';
    if d is null or jsonb_typeof(d) <> 'object' then raise exception 'bad data'; end if;
    if pg_column_size(d) > 100000 then raise exception 'row too large'; end if;
    ts := coalesce((d->>'updatedAt')::timestamptz, v_now);
    if ts > v_now + interval '1 day' then ts := v_now; end if;   -- 端末の時計が大きくずれていても未来の行で固定されないように

    if k = 'room' then
      insert into public.matane_rooms as x (id, data, updated_at, synced_at)
      values (p_room, d || jsonb_build_object('id', p_room), ts, v_now)
      on conflict (id) do update
        set data = excluded.data, updated_at = excluded.updated_at, synced_at = v_now
        where x.updated_at <= excluded.updated_at;

    elsif k = 'item' then
      rid := d->>'id';
      ik  := d->>'kind';
      if not exists (select 1 from public.matane_rooms where id = p_room) then raise exception 'room not found'; end if;
      if ik = 'member' and not exists (select 1 from public.matane_items where room_id = p_room and id = rid)
         and (select count(*) from public.matane_items where room_id = p_room and kind = 'member') >= 8 then
        raise exception 'too many members';
      end if;
      if not exists (select 1 from public.matane_items where room_id = p_room and id = rid)
         and (select count(*) from public.matane_items where room_id = p_room) >= 20000 then
        raise exception 'too many items';
      end if;
      insert into public.matane_items as x (room_id, id, kind, data, deleted, updated_at, synced_at)
      values (p_room, rid, ik, d - 'deleted' - 'kind', coalesce((d->>'deleted')::boolean, false), ts, v_now)
      on conflict (room_id, id) do update
        set data = excluded.data, deleted = excluded.deleted, updated_at = excluded.updated_at, synced_at = v_now
        where x.updated_at <= excluded.updated_at and x.kind = excluded.kind;

    else
      raise exception 'bad kind %', k;
    end if;
    n_applied := n_applied + 1;
  end loop;

  return jsonb_build_object('ok', true, 'applied', n_applied, 'at', v_now);
end;
$$;


-- ---------------------------------------------------------------------
-- 週次バックアップ用（C:\Users\ひかる\.claude\backup-supabase.ps1 が呼ぶ）。
-- テーブルは閉じているので、合言葉（このPCにだけある）を知っている場合だけ全件を返す。
-- ---------------------------------------------------------------------
create or replace function public.matane_backup_dump(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  want text;
begin
  select v into want from public.matane_secret where k = 'backup_token_sha256';
  if want is null or p_token is null or encode(sha256(convert_to(p_token, 'UTF8')), 'hex') <> want then
    raise exception 'denied';
  end if;
  return jsonb_build_object(
    'at', now(),
    'rooms', coalesce((select jsonb_agg(to_jsonb(r)) from public.matane_rooms r), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(to_jsonb(i)) from public.matane_items i), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.matane_pull(text, timestamptz)    from public;
revoke all on function public.matane_push_batch(text, jsonb)    from public;
revoke all on function public.matane_backup_dump(text)          from public;
grant execute on function public.matane_pull(text, timestamptz) to anon, authenticated;
grant execute on function public.matane_push_batch(text, jsonb) to anon, authenticated;
grant execute on function public.matane_backup_dump(text)       to anon, authenticated;
