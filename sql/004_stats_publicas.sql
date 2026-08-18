-- ============================================================================
-- MAQ.HEL — contadores públicos (máquinas vendidas / clientes asesorados)
-- Expone solo un conteo agregado, nunca las filas individuales.
-- Ejecutar en: Supabase Dashboard -> SQL Editor -> New query -> Run
-- ============================================================================

create or replace view public.public_stats as
select
  (select count(*) from public.reservations where status = 'approved') as machines_sold,
  (select count(*) from public.price_requests) as clients_advised;

grant select on public.public_stats to anon;
