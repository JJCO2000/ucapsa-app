-- UCAPSA — rol operativo Entrenador
--
-- Se mantiene separado del resto del workspace porque PostgreSQL exige que un
-- nuevo valor enum se confirme antes de utilizarlo en casts o escrituras.

alter type public.app_role add value if not exists 'trainer';
