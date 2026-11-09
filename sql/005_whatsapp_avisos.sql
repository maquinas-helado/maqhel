-- ============================================================================
-- MAQ.HEL — marcar qué avisos de WhatsApp ya se le mandaron al vendedor
-- Ejecutar en: Supabase Dashboard -> SQL Editor -> New query -> Run
-- ============================================================================

-- "recibimos tu solicitud" (al enviar la máquina) y "ya está publicada" (al aprobarla):
-- cada uno se manda una sola vez por publicación
alter table public.listings add column if not exists wa_recibido_at timestamptz;
alter table public.listings add column if not exists wa_publicada_at timestamptz;

-- las publicaciones que ya estaban aprobadas antes de activar los avisos
-- no deben recibir el mensaje de "ya está publicada" de golpe
update public.listings set wa_recibido_at = now(), wa_publicada_at = now() where status <> 'pending';
