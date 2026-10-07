-- =====================================================================
-- またね（ふたりの「いつか」と会う日のノート）  Supabase スキーマ
--
-- 既存プロジェクト gzayrjlhruhvklsidraw に相乗り。テーブルは matane_ 接頭辞。
--
-- ログインは無し。ふたりの部屋ごとのランダムなID（16文字）が「合言葉」になる。
-- テーブルは anon から直接は読めないように閉じ、IDを知っている人だけが
-- 下の関数（matane_pull / matane_push_batch）経由で読み書きできる。
--
-- 部屋の中身（メンバー・やりたいこと・会う日・読書会の本・語りたいこと・付箋・「私も」）は
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
  kind        text not null check (kind in ('member', 'wish', 'plan', 'book', 'note', 'like', 'memo', 'photo')),
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
create or replace function public.matane_push_batch(p_room text, p_ops jsonb, p_pass text default null, p_pass_token text default null)
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
    -- 写真（アイコン）だけは大きめを許す。それ以外は 100KB まで
    if pg_column_size(d) > (case when d->>'kind' = 'photo' then 900000 else 100000 end) then raise exception 'row too large'; end if;
    ts := coalesce((d->>'updatedAt')::timestamptz, v_now);
    if ts > v_now + interval '1 day' then ts := v_now; end if;   -- 端末の時計が大きくずれていても未来の行で固定されないように

    if k = 'room' then
      -- 新しい部屋をつくれるのは、オーナーと、オーナーが認めた人だけ（前にあった部屋の復元はだれでも）
      if not exists (select 1 from public.matane_rooms where id = p_room)
         and not exists (select 1 from public.matane_room_log where id = p_room) then
        if coalesce(public.matane_pass_status_of(p_pass, p_pass_token), '') not in ('owner', 'ok') then
          raise exception 'not allowed to create';
        end if;
        insert into public.matane_room_log (id, pass_id) values (p_room, p_pass);
      end if;
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
      if ik = 'photo' and not exists (select 1 from public.matane_items where room_id = p_room and id = rid)
         and (select count(*) from public.matane_items where room_id = p_room and kind = 'photo' and not deleted) >= 60 then
        raise exception 'too many photos';
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
revoke all on function public.matane_push_batch(text, jsonb, text, text) from public;
revoke all on function public.matane_backup_dump(text)          from public;
grant execute on function public.matane_pull(text, timestamptz) to anon, authenticated;
grant execute on function public.matane_push_batch(text, jsonb, text, text) to anon, authenticated;
grant execute on function public.matane_backup_dump(text)       to anon, authenticated;


-- =====================================================================
-- v1.3.0 部屋をつくれる人（パス）
--
-- ・端末ごとのパス（id ＋ token）。サーバーには token の sha256 だけ置く。
-- ・status: none（名乗っただけ）/ wait（お願い中）/ ok（つくれる）/ no（見送り）/ owner（オーナー）
-- ・新しい部屋は owner / ok のパスを添えたときだけつくれる（matane_push_batch で確かめる）。
-- ・matane_room_log は「一度でもあった部屋」の記録。ここにある部屋はパス無しでも復元できる。
-- ・オーナーになる合言葉は matane_secret の owner_code_sha256（リンクはこのPCの
--   C:\Users\ひかる\.claude\matane-owner-link.txt にだけある）。
-- =====================================================================
create table if not exists public.matane_passes (
  id            text primary key check (id ~ '^[A-Za-z0-9]{12,32}$'),
  token_sha256  text not null,
  name          text,
  status        text not null default 'none' check (status in ('none', 'wait', 'ok', 'no', 'owner')),
  via           text,
  created_at    timestamptz not null default now(),
  requested_at  timestamptz,
  decided_at    timestamptz,
  seen_at       timestamptz not null default now()
);
create table if not exists public.matane_room_log (
  id          text primary key,
  pass_id     text,
  created_at  timestamptz not null default now()
);
alter table public.matane_passes   enable row level security;
alter table public.matane_room_log enable row level security;
revoke all on public.matane_passes, public.matane_room_log from anon, authenticated;

create or replace function public.matane_pass_status_of(p_id text, p_token text)
returns text language sql stable security definer set search_path = public, pg_catalog as $$
  select status from public.matane_passes
  where id = p_id and p_token is not null and token_sha256 = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;
revoke all on function public.matane_pass_status_of(text, text) from public, anon, authenticated;

-- 名乗る（無ければ登録）。今の状態とオーナーの名前を返す
create or replace function public.matane_pass_hello(p_id text, p_token text, p_name text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare st text;
begin
  if p_id is null or p_id !~ '^[A-Za-z0-9]{12,32}$' or p_token is null or length(p_token) < 20 then raise exception 'bad pass'; end if;
  if not exists (select 1 from public.matane_passes where id = p_id) then
    if (select count(*) from public.matane_passes) >= 3000 then raise exception 'too many passes'; end if;
    insert into public.matane_passes (id, token_sha256, name) values (p_id, encode(sha256(convert_to(p_token, 'UTF8')), 'hex'), left(p_name, 40));
  end if;
  st := public.matane_pass_status_of(p_id, p_token);
  if st is null then raise exception 'bad pass'; end if;
  update public.matane_passes set seen_at = now(), name = coalesce(nullif(left(trim(p_name), 40), ''), name) where id = p_id;
  return jsonb_build_object('status', st, 'owner', (select name from public.matane_passes where status = 'owner' order by created_at limit 1));
end; $$;

-- 「部屋をつくりたい」とお願いする
create or replace function public.matane_pass_request(p_id text, p_token text, p_name text, p_via text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare st text;
begin
  st := public.matane_pass_status_of(p_id, p_token);
  if st is null then raise exception 'bad pass'; end if;
  if st in ('none', 'no') then
    if (select count(*) from public.matane_passes where status = 'wait') >= 50 then raise exception 'too many requests'; end if;
    update public.matane_passes set status = 'wait', requested_at = now(), name = coalesce(nullif(left(trim(p_name), 40), ''), name), via = left(p_via, 120) where id = p_id;
    st := 'wait';
  end if;
  return jsonb_build_object('status', st);
end; $$;

-- この端末をオーナーにする（合言葉が要る）
create or replace function public.matane_pass_owner(p_id text, p_token text, p_code text)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare want text;
begin
  select v into want from public.matane_secret where k = 'owner_code_sha256';
  if want is null or p_code is null or encode(sha256(convert_to(p_code, 'UTF8')), 'hex') <> want then raise exception 'denied'; end if;
  if public.matane_pass_status_of(p_id, p_token) is null then raise exception 'bad pass'; end if;
  update public.matane_passes set status = 'owner', decided_at = now() where id = p_id;
  return jsonb_build_object('status', 'owner');
end; $$;

-- オーナーだけ：一覧と、承認・見送り・取り消し
create or replace function public.matane_pass_admin(p_id text, p_token text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
begin
  if coalesce(public.matane_pass_status_of(p_id, p_token), '') <> 'owner' then raise exception 'denied'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'status', status, 'via', via,
    'requestedAt', requested_at, 'decidedAt', decided_at, 'seenAt', seen_at) order by coalesce(requested_at, created_at) desc)
    from public.matane_passes), '[]'::jsonb);
end; $$;

create or replace function public.matane_pass_decide(p_id text, p_token text, p_target text, p_status text)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if coalesce(public.matane_pass_status_of(p_id, p_token), '') <> 'owner' then raise exception 'denied'; end if;
  if p_status not in ('ok', 'no', 'none') then raise exception 'bad status'; end if;
  update public.matane_passes set status = p_status, decided_at = now() where id = p_target and status <> 'owner';
  if not found then raise exception 'no such pass'; end if;
  return jsonb_build_object('ok', true);
end; $$;

revoke all on function public.matane_pass_hello(text, text, text) from public;
revoke all on function public.matane_pass_request(text, text, text, text) from public;
revoke all on function public.matane_pass_owner(text, text, text) from public;
revoke all on function public.matane_pass_admin(text, text) from public;
revoke all on function public.matane_pass_decide(text, text, text, text) from public;
grant execute on function public.matane_pass_hello(text, text, text) to anon, authenticated;
grant execute on function public.matane_pass_request(text, text, text, text) to anon, authenticated;
grant execute on function public.matane_pass_owner(text, text, text) to anon, authenticated;
grant execute on function public.matane_pass_admin(text, text) to anon, authenticated;
grant execute on function public.matane_pass_decide(text, text, text, text) to anon, authenticated;
