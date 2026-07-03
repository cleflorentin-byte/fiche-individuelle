-- ============================================================================
-- Schéma de base de données — Délégué Virtuel CFDT EIC LORCA
-- À exécuter dans Supabase > SQL Editor (une seule fois, après création du projet)
-- ============================================================================

-- Table des profils adhérents (liée à auth.users)
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  cp_number text,
  etablissement text,
  uo text,
  approved boolean not null default false,
  is_admin boolean not null default false,
  created_at timestamptz default now()
);

-- Table de l'historique journalier (calendrier / registre)
create table if not exists days (
  id bigint generated always as identity primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  date date not null,
  code text,
  libelle text,
  category text not null default 'none', -- repos | syndical | travail | greve | compteur | none
  schedule jsonb not null default '[]'::jsonb, -- [["PS","08:00"], ["K","12:00 13:30"], ["FS","17:15"]]
  source text not null default 'manuel', -- manuel | import_cps
  updated_at timestamptz default now(),
  unique (user_id, date)
);

-- Table des mois FIA (compteurs mensuels, saisis manuellement pour le moment)
create table if not exists fia_months (
  id bigint generated always as identity primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  year int not null,
  month int not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  unique (user_id, year, month)
);

-- ----------------------------------------------------------------------------
-- Création automatique d'un profil (non approuvé) à l'inscription
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, approved)
  values (new.id, new.raw_user_meta_data->>'full_name', false);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ----------------------------------------------------------------------------
-- Row Level Security : chacun ne voit/modifie que ses propres données
-- ----------------------------------------------------------------------------
alter table profiles enable row level security;
alter table days enable row level security;
alter table fia_months enable row level security;

create policy "Lecture de son propre profil" on profiles
  for select using (auth.uid() = id);
create policy "Mise à jour de son propre profil" on profiles
  for update using (auth.uid() = id);

create policy "Gestion de ses propres jours" on days
  for all using (auth.uid() = user_id);

create policy "Gestion de ses propres mois FIA" on fia_months
  for all using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- Validation des adhérents (étape manuelle, "à la main")
-- ----------------------------------------------------------------------------
-- Pour valider un nouvel adhérent après inscription :
--   Supabase > Table Editor > profiles > repérer la ligne par email/full_name
--   > passer "approved" à true.
-- Pour te désigner toi-même comme administrateur (optionnel, usage futur) :
--   update profiles set is_admin = true where id = '<ton-uuid-auth>';
