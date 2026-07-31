-- Athena Style — schéma Supabase (étape 1 : auth + sauvegarde cloud)
--
-- À exécuter dans Supabase : Dashboard > SQL Editor > New query > coller ce fichier > Run.
-- Ne touche à aucun code de l'app ; prépare uniquement la base pour les étapes suivantes.

-- ============================================================
-- 1. profils utilisateurs
-- ============================================================
-- Une ligne par compte, créée automatiquement à l'inscription (voir le trigger plus bas).
-- Sert notamment à afficher le vrai email dans l'écran Profil (étape 3).
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 2. dressing (vêtements)
-- ============================================================
-- Reprend les champs déjà utilisés dans AthenaStyle.jsx (name, category, color,
-- colorFamily, material, season, warmth, laundry, wearCount, monthsSinceWorn).
-- photo_path pointera vers un fichier du bucket clothing-photos (étape 5) ; nullable
-- pour l'instant car les photos ne sont pas encore migrées.
create table if not exists public.clothes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text not null,
  photo_path text,
  color text,
  color_family text,
  material text,
  season text,
  warmth text not null default 'leger',
  laundry boolean not null default false,
  wear_count integer not null default 0,
  months_since_worn integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clothes_user_id_idx on public.clothes(user_id);

-- ============================================================
-- 3. tenues (outfits)
-- ============================================================
-- item_ids référence des id de public.clothes, stockés en JSON (comme itemIds côté app).
-- is_favorite remplace la table de favoris séparée de l'app : plus simple, une seule table.
create table if not exists public.outfits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  item_ids jsonb not null default '[]'::jsonb,
  weather jsonb,
  scores jsonb,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists outfits_user_id_idx on public.outfits(user_id);

-- ============================================================
-- 4. agenda
-- ============================================================
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day text not null,
  title text not null,
  created_at timestamptz not null default now()
);

create index if not exists calendar_events_user_id_idx on public.calendar_events(user_id);

-- ============================================================
-- 5. préférences (une ligne par utilisateur)
-- ============================================================
-- Regroupe weatherPrefs, measurements, stylePrefs, notif — équivalent des clés
-- STORAGE_KEYS.weatherPrefs / measurements / stylePrefs / notif côté app.
create table if not exists public.preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  weather_prefs jsonb not null default '{}'::jsonb,
  measurements jsonb not null default '{}'::jsonb,
  style_prefs jsonb not null default '[]'::jsonb,
  notif boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 6. création automatique du profil à l'inscription
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  insert into public.preferences (user_id) values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- 7. Row Level Security — chacun ne voit/modifie que ses propres données
-- ============================================================
alter table public.profiles enable row level security;
alter table public.clothes enable row level security;
alter table public.outfits enable row level security;
alter table public.calendar_events enable row level security;
alter table public.preferences enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

create policy "clothes_all_own" on public.clothes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "outfits_all_own" on public.outfits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "calendar_events_all_own" on public.calendar_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "preferences_all_own" on public.preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- 8. stockage des photos
-- ============================================================
-- Bucket privé : chaque fichier sera rangé sous le chemin "{user_id}/{nom_fichier}"
-- (convention utilisée par les policies ci-dessous, à respecter au moment de l'upload
-- côté app à l'étape 5).
insert into storage.buckets (id, name, public)
values ('clothing-photos', 'clothing-photos', false)
on conflict (id) do nothing;

create policy "clothing_photos_select_own" on storage.objects
  for select using (
    bucket_id = 'clothing-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "clothing_photos_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'clothing-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "clothing_photos_update_own" on storage.objects
  for update using (
    bucket_id = 'clothing-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "clothing_photos_delete_own" on storage.objects
  for delete using (
    bucket_id = 'clothing-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
