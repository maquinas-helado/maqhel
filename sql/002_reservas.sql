-- ============================================================================
-- MAQ.HEL — sistema de reserva con seña real (Mercado Pago)
-- Ejecutar en: Supabase Dashboard -> SQL Editor -> New query -> Run
-- (Este script se suma al de sql/schema.sql, no lo reemplaza)
-- ============================================================================

-- cuándo deja de estar "reservada" una publicación (15 días desde el pago)
alter table public.listings add column if not exists reserved_until timestamptz;

-- registro de cada intento de reserva/pago, para que lo veas en el panel admin
create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  monto numeric,
  moneda text default 'USD',
  mp_preference_id text,
  mp_payment_id text,
  buyer_whatsapp text
);

alter table public.reservations enable row level security;

-- solo vos (admin) podés leer las reservas desde el navegador.
-- Las funciones server-side (Netlify Functions) escriben con la service_role key,
-- que salta el RLS por completo, así que no hace falta política de insert/update acá.
create policy "admin select reservations" on public.reservations
  for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

-- nota: "reserved_until" ya viaja en el select público existente sobre listings
-- (política "public select published listings" en schema.sql), así que el sitio
-- puede consultar si una publicación está reservada sin necesitar una política nueva.
