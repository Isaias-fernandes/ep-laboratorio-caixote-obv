-- Prepared but paused while Supabase returns HTTP 402 (egress quota).
do $$ declare jid bigint;begin
 select cron.schedule('ep-lab-live-every-minute','* * * * *',
 $job$select net.http_post(
 url:='https://iayxjarkeefbzjbpfurl.supabase.co/functions/v1/ep-lab-live',
 headers:=jsonb_build_object('Content-Type','application/json','x-lab-scheduler-token',
 (select decrypted_secret from vault.decrypted_secrets where name='ep_lab_live_scheduler_token')),
 body:='{}'::jsonb,timeout_milliseconds:=180000)$job$) into jid;
 perform cron.alter_job(jid,active:=false);
 select cron.schedule('ep-lab-live-verified-retention','37 4 * * *','select public.ep_lab_live_prune()') into jid;
 perform cron.alter_job(jid,active:=false);
end $$;
