-- UCAPSA — enum de rol Entrenador
--
-- Se mantiene separado del resto de la migración porque PostgreSQL puede exigir
-- que un nuevo valor enum quede confirmado antes de usarlo en funciones/casts.

alter type public.app_role add value if not exists 'trainer';
