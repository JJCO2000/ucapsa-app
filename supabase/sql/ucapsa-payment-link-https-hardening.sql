-- UCAPSA payment link transport hardening
--
-- Payment links are outbound financial actions. Persist only HTTPS links so a
-- manual database edit cannot reintroduce clear-text transport. Empty values
-- remain tolerated for compatibility with the singleton settings row.

alter table public.payment_settings
  drop constraint if exists payment_settings_clip_url_https_check;

alter table public.payment_settings
  add constraint payment_settings_clip_url_https_check
  check (
    clip_url is null
    or btrim(clip_url) = ''
    or btrim(clip_url) ~* '^https://'
  );
