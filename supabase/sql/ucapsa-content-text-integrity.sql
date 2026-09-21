-- UCAPSA — basic content invariants for events and announcements
--
-- The admin UI already rejects blank content. Enforce the same rule at the
-- database boundary so direct service/PostgREST writes cannot create records
-- that the product cannot meaningfully display.

do $ucapsa$
begin
  if exists (select 1 from public.events where btrim(title) = '') then
    raise exception 'Content hardening aborted: blank event titles require review.';
  end if;

  if exists (
    select 1
    from public.announcements
    where btrim(title) = '' or btrim(content) = ''
  ) then
    raise exception 'Content hardening aborted: blank announcement text requires review.';
  end if;
end;
$ucapsa$;

alter table public.events
  drop constraint if exists events_title_not_blank;
alter table public.events
  add constraint events_title_not_blank
  check (btrim(title) <> '');

alter table public.announcements
  drop constraint if exists announcements_title_not_blank;
alter table public.announcements
  add constraint announcements_title_not_blank
  check (btrim(title) <> '');

alter table public.announcements
  drop constraint if exists announcements_content_not_blank;
alter table public.announcements
  add constraint announcements_content_not_blank
  check (btrim(content) <> '');
