-- =========================================================
-- Niloa Team Workspace — Supabase Schema
-- =========================================================
-- Anleitung: Im Supabase Dashboard -> SQL Editor -> Neues
-- Query -> diesen kompletten Inhalt einfügen -> "Run".
-- =========================================================

-- Aktiviert UUID-Erzeugung (bei Supabase meist schon aktiv)
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------
-- TEAM-MITGLIEDER (Name + optionale 4-stellige PIN)
-- ---------------------------------------------------------
create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  pin text,
  created_at timestamptz default now()
);

alter table team_members enable row level security;
-- Bewusst KEINE direkten Policies für anon auf dieser Tabelle:
-- Zugriff läuft ausschließlich über die Funktionen unten, damit
-- PINs nie direkt per SELECT auslesbar sind.

-- Öffentliche, PIN-freie Sicht für die Login-Auswahl
create or replace view team_members_public as
  select id, name, (pin is not null) as has_pin
  from team_members
  order by name;

grant select on team_members_public to anon, authenticated;

-- Neues Teammitglied anlegen
create or replace function add_team_member(p_name text, p_pin text)
returns table(id uuid, name text)
language plpgsql
security definer
as $$
begin
  if p_pin is not null and p_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN muss genau 4 Ziffern haben, oder leer sein';
  end if;
  return query
    insert into team_members(name, pin) values (p_name, p_pin)
    returning team_members.id, team_members.name;
end;
$$;
grant execute on function add_team_member(text, text) to anon, authenticated;

-- Login prüfen (gibt true/false zurück, PIN selbst wird nie exponiert)
create or replace function verify_login(p_id uuid, p_pin text)
returns boolean
language plpgsql
security definer
as $$
declare
  stored_pin text;
begin
  select pin into stored_pin from team_members where id = p_id;
  if stored_pin is null then
    return true; -- kein PIN gesetzt -> offener Zugang
  end if;
  return stored_pin = p_pin;
end;
$$;
grant execute on function verify_login(uuid, text) to anon, authenticated;

-- Teammitglied entfernen
create or replace function remove_team_member(p_id uuid)
returns void
language sql
security definer
as $$
  delete from team_members where id = p_id;
$$;
grant execute on function remove_team_member(uuid) to anon, authenticated;


-- ---------------------------------------------------------
-- AUFGABEN
-- ---------------------------------------------------------
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  owner text,
  category text,
  priority text default 'mittel',
  deadline date,
  link text,
  status text default 'offen',
  created_by text,
  created_at timestamptz default now(),
  completed_at timestamptz,
  log jsonb default '[]'::jsonb
);
alter table tasks enable row level security;
create policy "public full access - tasks" on tasks for all using (true) with check (true);

-- ---------------------------------------------------------
-- SOCIAL MEDIA CONTENT
-- ---------------------------------------------------------
create table if not exists social_posts (
  id uuid primary key default gen_random_uuid(),
  date date,
  platform text,
  type text,
  owner text,
  note text,
  link text,
  status text default 'offen',
  created_by text,
  created_at timestamptz default now(),
  completed_at timestamptz,
  log jsonb default '[]'::jsonb
);
alter table social_posts enable row level security;
create policy "public full access - social_posts" on social_posts for all using (true) with check (true);

-- ---------------------------------------------------------
-- NEWSLETTER-KAMPAGNEN
-- ---------------------------------------------------------
create table if not exists newsletters (
  id uuid primary key default gen_random_uuid(),
  date date,
  topic text,
  segment text,
  note text,
  link text,
  status text default 'offen',
  created_by text,
  created_at timestamptz default now(),
  completed_at timestamptz,
  log jsonb default '[]'::jsonb
);
alter table newsletters enable row level security;
create policy "public full access - newsletters" on newsletters for all using (true) with check (true);

-- ---------------------------------------------------------
-- SUPPORT-TICKETS
-- ---------------------------------------------------------
create table if not exists support_tickets (
  id uuid primary key default gen_random_uuid(),
  customer_name text,
  order_number text,
  issue text,
  owner text,
  note text,
  status text default 'offen',
  created_by text,
  created_at timestamptz default now(),
  completed_at timestamptz,
  log jsonb default '[]'::jsonb
);
alter table support_tickets enable row level security;
create policy "public full access - support_tickets" on support_tickets for all using (true) with check (true);

-- ---------------------------------------------------------
-- DOKUMENTE (Link-Bibliothek, keine echten Datei-Uploads)
-- ---------------------------------------------------------
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text,
  link text not null,
  note text,
  added_by text,
  added_at timestamptz default now()
);
alter table documents enable row level security;
create policy "public full access - documents" on documents for all using (true) with check (true);

-- ---------------------------------------------------------
-- Realtime aktivieren, damit alle 6 Teammitglieder live
-- die Änderungen der anderen sehen, ohne neu zu laden
-- ---------------------------------------------------------
alter publication supabase_realtime add table tasks, social_posts, newsletters, support_tickets, documents;
