-- ============================================================================
-- MAQ.HEL — marcar una máquina como VENDIDA (queda a la vista con la franja roja,
-- sin poder comprarse). RESERVADA ya existe con reserved_until.
-- Ejecutar en: Supabase Dashboard -> SQL Editor -> New query -> Run
-- ============================================================================

alter table public.listings add column if not exists vendida boolean not null default false;
