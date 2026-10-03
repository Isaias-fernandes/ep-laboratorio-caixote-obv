-- Isolated laboratory storage. No existing motor or pharmacy tables are modified.
create table public.ep_lab_live_state (
 symbol text not null, interval text not null check(interval in ('5m','15m','1h')),
 candle_time timestamptz not null, observed_at timestamptz not null,
 data jsonb not null, primary key(symbol,interval)
);
create table public.ep_lab_live_events (
 id text primary key, symbol text not null, interval text not null check(interval in ('5m','15m','1h')),
 direction text not null check(direction in ('BUY','SELL')),
 status text not null check(status in ('PRE_SIGNAL','CONFIRMED','INVALIDATED','COMPLETED')),
 score integer not null check(score between 0 and 100),candle_time timestamptz not null,
 created_at timestamptz not null,updated_at timestamptz not null,data jsonb not null
);
create index ep_lab_live_events_updated_idx on public.ep_lab_live_events(updated_at);
create index ep_lab_live_events_pair_idx on public.ep_lab_live_events(symbol,interval);
create table public.ep_lab_live_control (
 id boolean primary key default true check(id),token_hash text not null,
 lease_until timestamptz not null default '-infinity',last_started_at timestamptz,
 last_finished_at timestamptz,result jsonb not null default '{}'
);
create table public.ep_lab_live_archive_receipts (
 event_id text primary key references public.ep_lab_live_events(id) on delete cascade,
 row_sha256 text not null,archived_at timestamptz not null default now(),release_url text not null
);
alter table public.ep_lab_live_state enable row level security;
alter table public.ep_lab_live_events enable row level security;
alter table public.ep_lab_live_control enable row level security;
alter table public.ep_lab_live_archive_receipts enable row level security;
revoke all on public.ep_lab_live_state,public.ep_lab_live_events,public.ep_lab_live_control from public,anon,authenticated;
grant all on public.ep_lab_live_state,public.ep_lab_live_events,public.ep_lab_live_control to service_role;
revoke all on public.ep_lab_live_archive_receipts from public,anon,authenticated;
grant all on public.ep_lab_live_archive_receipts to service_role;
create policy lab_live_state_service on public.ep_lab_live_state to service_role using(true) with check(true);
create policy lab_live_events_service on public.ep_lab_live_events to service_role using(true) with check(true);
create policy lab_live_control_service on public.ep_lab_live_control to service_role using(true) with check(true);
create policy lab_live_archive_service on public.ep_lab_live_archive_receipts to service_role using(true) with check(true);

do $$ declare token text;begin
 token:=encode(extensions.gen_random_bytes(32),'hex');
 perform vault.create_secret(token,'ep_lab_live_scheduler_token');
 insert into public.ep_lab_live_control(id,token_hash) values(true,encode(extensions.digest(token,'sha256'),'hex'));
end $$;

create function public.ep_lab_live_begin(p_token text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare started boolean;begin
 if not exists(select 1 from public.ep_lab_live_control where token_hash=encode(extensions.digest(p_token,'sha256'),'hex')) then
   return jsonb_build_object('authorized',false);
 end if;
 update public.ep_lab_live_control set lease_until=now()+interval '4 minutes',last_started_at=now()
 where id and lease_until<now();started:=found;
 return jsonb_build_object('authorized',true,'acquired',started);
end $$;

create function public.ep_lab_live_ingest(p_state jsonb,p_events jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare e jsonb;blocked boolean;begin
 perform pg_catalog.pg_advisory_xact_lock(7130149);
 blocked:=pg_catalog.pg_database_size(pg_catalog.current_database())>450*1024*1024
 or (select coalesce(sum(pg_catalog.pg_total_relation_size(c.oid)),0) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and (n.nspname='ep_market_history' or (n.nspname='public' and c.relname like 'ep_%')))>250*1024*1024;
 if blocked then raise exception 'LAB_STORAGE_LIMIT_250MB';end if;
 for e in select value from jsonb_array_elements(p_events) loop
  if not blocked or exists(select 1 from public.ep_lab_live_events where id=e->>'id') then
   insert into public.ep_lab_live_events(id,symbol,interval,direction,status,score,candle_time,created_at,updated_at,data)
   values(e->>'id',e->>'symbol',e->>'interval',e->>'direction',e->>'status',(e->>'score')::int,(e->>'candle_time')::timestamptz,(e->>'created_at')::timestamptz,(e->>'updated_at')::timestamptz,e->'data')
   on conflict(id) do update set status=excluded.status,updated_at=excluded.updated_at,data=excluded.data;
  end if;
 end loop;
 insert into public.ep_lab_live_state(symbol,interval,candle_time,observed_at,data)
 values(p_state->>'symbol',p_state->>'interval',(p_state->>'candle_time')::timestamptz,(p_state->>'observed_at')::timestamptz,p_state->'data')
 on conflict(symbol,interval) do update set candle_time=excluded.candle_time,observed_at=excluded.observed_at,data=excluded.data;
 return jsonb_build_object('storageBlocked',blocked);
end $$;
revoke all on function public.ep_lab_live_begin(text),public.ep_lab_live_ingest(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ep_lab_live_begin(text),public.ep_lab_live_ingest(jsonb,jsonb) to service_role;

-- A verified backup receipt is necessary before seven-day retention removes a row.
create function public.ep_lab_live_prune() returns bigint
language plpgsql security invoker set search_path='' as $$
declare removed bigint;begin
 with deleted as (
 delete from public.ep_lab_live_events e using public.ep_lab_live_archive_receipts r
 where e.id=r.event_id and e.updated_at<now()-interval '7 days'
 and e.status in ('INVALIDATED','COMPLETED')
 and coalesce(e.data->>'trackingStatus','WAITING') <> 'COLLECTING'
 and encode(extensions.digest(pg_catalog.convert_to(pg_catalog.row_to_json(e)::text,'UTF8'),'sha256'),'hex')=r.row_sha256
 returning 1) select count(*) into removed from deleted;
 return removed;end $$;
revoke all on function public.ep_lab_live_prune() from public,anon,authenticated;
grant execute on function public.ep_lab_live_prune() to service_role;
