-- ============================================================================
-- MAQ.HEL — marcar si ya se le avisó al comprador los datos del vendedor
-- Ejecutar en: Supabase Dashboard -> SQL Editor -> New query -> Run
-- ============================================================================

alter table public.reservations add column if not exists buyer_notified boolean default false;

create policy "admin update reservations" on public.reservations
  for update to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));
