-- Isolated family tests only; matches the columns read from production's privacy_notices table.
-- Not a production migration and never publishes a real privacy notice.
\set ON_ERROR_STOP on
DO $$ BEGIN
 IF current_database()<>'ucapsa_test' THEN
   RAISE EXCEPTION 'Refuse to create synthetic legal notices outside test DB';
 END IF;
END $$;
CREATE TABLE public.privacy_notices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 version text NOT NULL UNIQUE,
 status text NOT NULL CHECK(status IN ('draft','published','retired')),
 integral_notice text,
 simplified_notice text,
 published_at timestamptz
);
INSERT INTO public.privacy_notices(version,status,integral_notice,simplified_notice,published_at)
VALUES ('1.2-test','published','Tratamiento de datos de cuentas propias','Privacidad de cuenta individual',now());
