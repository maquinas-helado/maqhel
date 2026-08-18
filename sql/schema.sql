-- ============================================================================
-- MAQ.HEL — schema de Supabase
-- Ejecutar completo en: Supabase Dashboard -> SQL Editor -> New query -> Run
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. TABLAS
-- ---------------------------------------------------------------------------

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','published','rejected')),

  marca text,
  tipo text,
  modelo text,
  capacidad text,
  anio integer,
  voltaje text,
  descripcion text,

  precio numeric,
  moneda text default 'USD',

  garantia boolean default false,
  garantia_tiempo text,
  service_cuando text,
  service_que text,
  cuotas boolean default false,
  cuotas_como text,

  fotos text[] default '{}',
  video_url text,

  contacto_nombre text,
  contacto_info text,
  direccion text,
  localidad text,
  provincia text,
  pais text default 'Argentina'
);

create table if not exists public.price_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new','contacted')),
  ref text not null default ('MH-' || to_char(now(), 'YYMMDDHH24MISS')),

  empresa text,
  pais text,
  localidad text,
  ubicacion text,
  whatsapp text,
  contacto text,
  email text,
  comentarios text,

  maquina text,
  marca text
);

create table if not exists public.brand_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new','contacted')),

  tipo text,
  empresa text,
  marca text,
  contacto_nombre text,
  whatsapp text,
  email text,
  pais_provincia text,
  sitio text,
  productos text[] default '{}',
  mensaje text,
  logo_url text
);

-- Usuarios admin habilitados para leer el panel (vos te agregás acá después
-- de crear tu usuario en Authentication -> Users, ver instrucciones al final).
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- 2. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------

alter table public.listings enable row level security;
alter table public.price_requests enable row level security;
alter table public.brand_requests enable row level security;
alter table public.admins enable row level security;

-- cualquiera (anon) puede INSERTAR una publicación, siempre en estado 'pending'
create policy "public insert listings" on public.listings
  for insert to anon
  with check (status = 'pending');

create policy "public insert price_requests" on public.price_requests
  for insert to anon
  with check (status = 'new');

create policy "public insert brand_requests" on public.brand_requests
  for insert to anon
  with check (status = 'new');

-- nadie (ni anon ni authenticated de a pie) puede leer estas tablas directo,
-- salvo que su user_id esté en admins
create policy "admin select listings" on public.listings
  for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

create policy "admin update listings" on public.listings
  for update to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));

create policy "admin select price_requests" on public.price_requests
  for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

create policy "admin update price_requests" on public.price_requests
  for update to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));

create policy "admin select brand_requests" on public.brand_requests
  for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

create policy "admin update brand_requests" on public.brand_requests
  for update to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));

-- también público: el catálogo (index.html) necesita poder leer las
-- publicaciones YA publicadas, para mostrarlas en "Máquinas usadas"
create policy "public select published listings" on public.listings
  for select to anon
  using (status = 'published');

-- cada admin puede ver su propia fila en admins (necesario para que el
-- exists(...) de arriba funcione), nadie más puede leer la tabla
create policy "self read admins" on public.admins
  for select to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. STORAGE (fotos, video, logos)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('listing-media', 'listing-media', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('brand-logos', 'brand-logos', true)
on conflict (id) do nothing;

-- cualquiera puede subir (los formularios públicos suben fotos/video/logo)
create policy "public upload listing-media" on storage.objects
  for insert to anon
  with check (bucket_id = 'listing-media');

create policy "public upload brand-logos" on storage.objects
  for insert to anon
  with check (bucket_id = 'brand-logos');

-- lectura pública (para poder mostrar las imágenes en el sitio con una URL directa)
create policy "public read listing-media" on storage.objects
  for select to public
  using (bucket_id = 'listing-media');

create policy "public read brand-logos" on storage.objects
  for select to public
  using (bucket_id = 'brand-logos');

-- ============================================================================
-- 4. DESPUÉS de correr este script:
--   1) Authentication -> Users -> Add user: creá tu usuario admin (email + contraseña).
--   2) Copiá su "User UID" y corré, reemplazando el UUID:
--
--      insert into public.admins (user_id) values ('PEGÁ-ACÁ-EL-UUID');
--
--   3) (Recomendado) Authentication -> Settings -> Desactivar "Allow new users
--      to sign up", así nadie más puede crearse una cuenta propia.
-- ============================================================================
