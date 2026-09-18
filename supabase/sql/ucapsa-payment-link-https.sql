-- UCAPSA payment-link transport hardening.
--
-- Payment links are customer-facing and must never be stored with plaintext HTTP.
-- NULL/blank is allowed because Clip is optional.

update public.payment_settings
set clip_url = null,
    updated_at = now()
where clip_url is not null
  and btrim(clip_url) <> ''
  and clip_url !~* '^https://';

alter table public.payment_settings
  drop constraint if exists payment_settings_clip_url_https_check;

alter table public.payment_settings
  add constraint payment_settings_clip_url_https_check
  check (
    clip_url is null
    or btrim(clip_url) = ''
    or btrim(clip_url) ~* '^https://[^[:space:]]+$'
  );
