begin;
select plan(12);

select has_column('public','athletes','user_id','athlete login link exists');
select has_table('public','mobile_uploads','mobile uploads exist');
select has_table('public','mobile_analysis_requests','mobile analysis requests exist');
select has_table('public','mobile_deletion_audit','mobile deletion audit exists');
select results_eq(
  $$select relrowsecurity from pg_class where oid='public.mobile_uploads'::regclass$$,
  array[true], 'mobile upload RLS active');
select results_eq(
  $$select relrowsecurity from pg_class where oid='public.mobile_analysis_requests'::regclass$$,
  array[true], 'mobile analysis RLS active');
select results_eq(
  $$select relrowsecurity from pg_class where oid='public.mobile_deletion_audit'::regclass$$,
  array[true], 'mobile deletion RLS active');
select policies_are('public','mobile_uploads',
  array['athletes read their own mobile uploads'],'uploads expose only owned read policy');
select policies_are('public','mobile_analysis_requests',
  array['athletes read their own mobile analysis requests'],'analysis requests expose only owned read policy');
select policies_are('public','mobile_deletion_audit',
  array['athletes read their own mobile deletion audit'],'deletion audit exposes only owned read policy');
select has_index('public','mobile_uploads','mobile_uploads_user_id_idempotency_key_key',
  'upload idempotency is unique per user');
select has_index('public','mobile_analysis_requests','mobile_analysis_requests_user_id_idempotency_key_key',
  'analysis idempotency is unique per user');

select * from finish();
rollback;
