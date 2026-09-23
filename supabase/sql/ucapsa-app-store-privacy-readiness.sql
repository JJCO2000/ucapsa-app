-- UCAPSA App Store privacy readiness.
-- Legal identity and operational scope were supplied by UCAPSA on 2026-09-22.
-- This migration intentionally minimizes collection before publishing notice v1.0.

alter table public.dogs
  drop constraint if exists dogs_appstore_unused_fields_null;

update public.dogs
set
  allergies = null,
  medications = null,
  feeding_notes = null,
  behavior_notes = null,
  veterinarian_name = null,
  veterinarian_phone = null,
  emergency_contact_name = null,
  emergency_contact_phone = null,
  notes = null
where allergies is not null
   or medications is not null
   or feeding_notes is not null
   or behavior_notes is not null
   or veterinarian_name is not null
   or veterinarian_phone is not null
   or emergency_contact_name is not null
   or emergency_contact_phone is not null
   or notes is not null;

create or replace function public.enforce_dog_appstore_minimization()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.allergies := null;
  new.medications := null;
  new.feeding_notes := null;
  new.behavior_notes := null;
  new.veterinarian_name := null;
  new.veterinarian_phone := null;
  new.emergency_contact_name := null;
  new.emergency_contact_phone := null;
  new.notes := null;
  return new;
end;
$$;

revoke all on function public.enforce_dog_appstore_minimization()
  from public, anon, authenticated;
grant execute on function public.enforce_dog_appstore_minimization()
  to service_role;

drop trigger if exists enforce_dog_appstore_minimization_before_write
  on public.dogs;
create trigger enforce_dog_appstore_minimization_before_write
before insert or update of
  allergies,
  medications,
  feeding_notes,
  behavior_notes,
  veterinarian_name,
  veterinarian_phone,
  emergency_contact_name,
  emergency_contact_phone,
  notes
on public.dogs
for each row
execute function public.enforce_dog_appstore_minimization();

alter table public.dogs
  add constraint dogs_appstore_unused_fields_null
  check (
    allergies is null
    and medications is null
    and feeding_notes is null
    and behavior_notes is null
    and veterinarian_name is null
    and veterinarian_phone is null
    and emergency_contact_name is null
    and emergency_contact_phone is null
    and notes is null
  );

comment on constraint dogs_appstore_unused_fields_null on public.dogs is
  'App Store v1 minimization: disabled dog health/routine/veterinary/free-text fields. Drop only with a reviewed privacy scope change.';

update public.privacy_notices
set status = 'retired',
    updated_at = now()
where status = 'published'
  and version <> '1.0-appstore-2026-09-22';

insert into public.privacy_notices (
  version,
  status,
  responsible_name,
  responsible_address,
  contact_email,
  data_categories,
  sensitive_data_categories,
  purposes,
  consent_required_purposes,
  limitation_mechanisms,
  arco_procedure,
  change_notice_method,
  transfer_clause,
  simplified_notice,
  integral_notice,
  effective_from,
  published_at,
  created_by,
  published_by,
  created_at,
  updated_at
) values (
  '1.0-appstore-2026-09-22',
  'published',
  $rn$Universidad de Crianza y Adiestramiento Peruano, S.A. de C.V.$rn$,
  $ra$Privada de Tetenco #5, Colonia San Miguel Topilejo, C.P. 14500, Alcaldía Tlalpan, Ciudad de México, México.$ra$,
  $ce$ucapsa84@gmail.com$ce$,
  $dc$Datos de identificación y contacto: nombre completo, correo electrónico y teléfono. Datos de cuenta y autenticación: identificador de usuario, credenciales administradas por Supabase y constancia de mayoría de edad y aceptación legal. Datos técnicos: token de notificaciones, plataforma, identificadores técnicos del dispositivo y versión de la app. Datos básicos de los perros: nombre, raza, fecha de nacimiento, sexo y peso. Datos operativos: inscripciones, horarios, clases, asistencias, prácticas, progreso, niveles, exámenes, competencia, logros, membresías, visitas y códigos QR. Datos administrativos de pagos: monto, concepto, periodo, método, fecha, estado, obligación relacionada y notas administrativas. Preferencias de notificaciones y registros de solicitudes de privacidad o eliminación de cuenta.$dc$,
  $sd$UCAPSA App no solicita ni habilita campos destinados a recabar datos personales sensibles de las personas usuarias. Los datos básicos relativos a los perros no constituyen datos personales sensibles de una persona física. UCAPSA evita solicitar información de salud humana u otras categorías sensibles para operar esta versión de la app.$sd$,
  $pu$Finalidades primarias y necesarias: crear y administrar la cuenta; autenticar a la persona usuaria; identificarla y contactarla para la operación del servicio; administrar los perros vinculados a la cuenta; gestionar clases, inscripciones, horarios, asistencias, prácticas, progreso, niveles, exámenes, competencia y logros; administrar membresías, visitas y códigos QR; llevar un control administrativo auxiliar de pagos y obligaciones; enviar notificaciones operativas sobre clases, eventos, anuncios, membresía y logros; brindar soporte, seguridad, continuidad y prevención de abuso; atender derechos ARCO, solicitudes de privacidad y eliminación de cuenta. UCAPSA App no utiliza los datos para publicidad, marketing directo, venta de datos ni perfilado comercial.$pu$,
  $cp$En esta versión no existen finalidades secundarias de publicidad o mercadotecnia. La creación de una cuenta requiere que la persona usuaria confirme que tiene 18 años o más y que ha leído y aceptado el Aviso de Privacidad y los Términos de Uso vigentes. Si UCAPSA incorpora en el futuro una finalidad opcional que legalmente requiera consentimiento adicional, solicitará dicho consentimiento por separado antes de iniciar ese tratamiento.$cp$,
  $lm$La persona usuaria puede administrar las categorías de notificaciones disponibles desde Ajustes de la app. Para solicitar la limitación de cualquier tratamiento no indispensable, revocar un consentimiento cuando legalmente proceda o plantear una solicitud de privacidad, puede escribir a ucapsa84@gmail.com. Como las finalidades descritas son necesarias para operar la cuenta y los servicios solicitados, limitar tratamientos esenciales puede impedir mantener determinadas funciones; en ese caso la persona puede solicitar la eliminación de su cuenta desde la propia app.$lm$,
  $ar$Administración de UCAPSA es el área responsable de tramitar solicitudes de acceso, rectificación, cancelación y oposición (ARCO). La solicitud puede iniciarse en ucapsa84@gmail.com e indicar: nombre de la persona titular; medio para recibir notificaciones; derecho que desea ejercer; descripción clara de los datos involucrados y cualquier elemento que facilite su localización. UCAPSA verificará la identidad antes de revelar, modificar o cancelar datos. La determinación se comunicará en un plazo máximo de 20 días desde la recepción de la solicitud y, si resulta procedente, se hará efectiva dentro de los 15 días siguientes; ambos plazos pueden ampliarse una sola vez por un periodo igual cuando las circunstancias lo justifiquen, conforme a la LFPDPPP vigente. La eliminación de la cuenta de clientes y socios también puede iniciarse directamente en Ajustes > Eliminar cuenta.$ar$,
  $cm$Los cambios al aviso se comunicarán mediante la versión publicada dentro de UCAPSA App y en https://hrfecmviyiluubymsoeq.supabase.co/functions/v1/privacy-policy. Cuando el cambio sea material y resulte razonable, UCAPSA también podrá comunicarlo mediante un aviso dentro de la app o al correo asociado a la cuenta antes de que el nuevo tratamiento sea aplicable.$cm$,
  $tr$UCAPSA no vende datos personales ni los transfiere a terceros para publicidad. Para operar la app utiliza proveedores tecnológicos que actúan como encargados del tratamiento, principalmente Supabase para autenticación, base de datos y funciones; Expo para infraestructura de la aplicación y notificaciones; Apple Push Notification service (APNs) para la entrega de notificaciones en iOS; y Google Firebase Cloud Messaging (FCM) para la entrega de notificaciones en Android. La infraestructura principal de Supabase de UCAPSA App se encuentra actualmente en la región us-west-2 de Estados Unidos, por lo que puede existir tratamiento internacional por encargados. Estos proveedores deben tratar los datos conforme a las instrucciones y medidas aplicables al servicio. Las transferencias a terceros para fines propios sólo se realizarán cuando sean necesarias y estén permitidas por la legislación aplicable, comunicando el aviso y obteniendo consentimiento cuando corresponda.$tr$,
  $sn$Universidad de Crianza y Adiestramiento Peruano, S.A. de C.V., con domicilio en Privada de Tetenco #5, Colonia San Miguel Topilejo, C.P. 14500, Alcaldía Tlalpan, Ciudad de México, México, es responsable de los datos tratados mediante UCAPSA App. La app utiliza datos de identificación y contacto, cuenta y dispositivo, información básica de los perros y registros operativos de clases, asistencias, membresías, logros y pagos administrativos para operar los servicios de UCAPSA. No se utilizan para publicidad ni se venden. No se solicitan datos personales sensibles. El aviso integral y los medios para ejercer derechos ARCO se encuentran dentro de la app y en https://hrfecmviyiluubymsoeq.supabase.co/functions/v1/privacy-policy.$sn$,
  $in$AVISO DE PRIVACIDAD INTEGRAL DE UCAPSA APP

1. Responsable
Universidad de Crianza y Adiestramiento Peruano, S.A. de C.V. (“UCAPSA”), con domicilio en Privada de Tetenco #5, Colonia San Miguel Topilejo, C.P. 14500, Alcaldía Tlalpan, Ciudad de México, México, es responsable del tratamiento de los datos personales recabados mediante UCAPSA App. El área que atiende privacidad y derechos ARCO es Administración de UCAPSA. Correo: ucapsa84@gmail.com.

2. Alcance y personas usuarias
Este aviso aplica al tratamiento realizado mediante UCAPSA App para clientes, socios y personas usuarias con cuenta. En esta versión, únicamente las personas de 18 años o más pueden crear una cuenta. UCAPSA no solicita fecha de nacimiento de la persona usuaria para esta finalidad; se registra una declaración de mayoría de edad.

3. Datos personales tratados
Datos de identificación y contacto: nombre completo, correo electrónico y teléfono. Datos de cuenta y autenticación: identificador de usuario, credenciales administradas por Supabase y constancia de mayoría de edad y aceptación legal. Datos técnicos: token de notificaciones, plataforma, identificadores técnicos del dispositivo y versión de la app. Datos básicos de los perros: nombre, raza, fecha de nacimiento, sexo y peso. Datos operativos: inscripciones, horarios, clases, asistencias, prácticas, progreso, niveles, exámenes, competencia, logros, membresías, visitas y códigos QR. Datos administrativos de pagos: monto, concepto, periodo, método, fecha, estado, obligación relacionada y notas administrativas. Preferencias de notificaciones y registros de solicitudes de privacidad o eliminación de cuenta.

La contraseña se gestiona mediante el servicio de autenticación de Supabase y UCAPSA App no necesita conocerla en texto claro.

4. Datos personales sensibles
UCAPSA App no solicita ni habilita campos destinados a recabar datos personales sensibles de las personas usuarias. Los datos básicos relativos a los perros no constituyen datos personales sensibles de una persona física. UCAPSA evita solicitar información de salud humana u otras categorías sensibles para operar esta versión de la app.

Los campos de salud, medicamentos, alimentación, conducta, veterinario y contacto de emergencia del perro no están habilitados para captura en esta versión de la app.

5. Finalidades
Finalidades primarias y necesarias: crear y administrar la cuenta; autenticar a la persona usuaria; identificarla y contactarla para la operación del servicio; administrar los perros vinculados a la cuenta; gestionar clases, inscripciones, horarios, asistencias, prácticas, progreso, niveles, exámenes, competencia y logros; administrar membresías, visitas y códigos QR; llevar un control administrativo auxiliar de pagos y obligaciones; enviar notificaciones operativas sobre clases, eventos, anuncios, membresía y logros; brindar soporte, seguridad, continuidad y prevención de abuso; atender derechos ARCO, solicitudes de privacidad y eliminación de cuenta. UCAPSA App no utiliza los datos para publicidad, marketing directo, venta de datos ni perfilado comercial.

Todas las finalidades anteriores son primarias y están relacionadas con la operación de la cuenta o de los servicios solicitados. No existen finalidades secundarias de marketing en esta versión.

6. Consentimiento
En esta versión no existen finalidades secundarias de publicidad o mercadotecnia. La creación de una cuenta requiere que la persona usuaria confirme que tiene 18 años o más y que ha leído y aceptado el Aviso de Privacidad y los Términos de Uso vigentes. Si UCAPSA incorpora en el futuro una finalidad opcional que legalmente requiera consentimiento adicional, solicitará dicho consentimiento por separado antes de iniciar ese tratamiento.

Cuando el tratamiento sea necesario para mantener la relación jurídica o prestar una función solicitada, UCAPSA lo realizará conforme a la legislación aplicable y al presente aviso. La persona usuaria puede retirar consentimientos opcionales cuando existan, sin efectos retroactivos.

7. Pagos
El módulo de pagos es un control administrativo auxiliar para identificar obligaciones y pagos registrados. Puede conservar monto, concepto, periodo, método, fecha, estado, notas y la persona administradora que efectuó el registro. UCAPSA App no procesa números de tarjeta, CVV ni credenciales bancarias de la persona usuaria. Este registro no sustituye CFDI, comprobantes fiscales, estados de cuenta ni documentación contable que pueda emitirse o conservarse fuera de la app.

8. Notificaciones y permisos
UCAPSA App puede solicitar permiso del sistema para enviar notificaciones operativas y para utilizar la cámara cuando la persona usa funciones de escaneo QR. El permiso de cámara se utiliza para leer códigos QR; la app no requiere acceso al micrófono para esa función. Las categorías de notificación disponibles pueden administrarse en Ajustes.

9. Proveedores tecnológicos, encargados y tratamiento internacional
UCAPSA no vende datos personales ni los transfiere a terceros para publicidad. Para operar la app utiliza proveedores tecnológicos que actúan como encargados del tratamiento, principalmente Supabase para autenticación, base de datos y funciones; Expo para infraestructura de la aplicación y notificaciones; Apple Push Notification service (APNs) para la entrega de notificaciones en iOS; y Google Firebase Cloud Messaging (FCM) para la entrega de notificaciones en Android. La infraestructura principal de Supabase de UCAPSA App se encuentra actualmente en la región us-west-2 de Estados Unidos, por lo que puede existir tratamiento internacional por encargados. Estos proveedores deben tratar los datos conforme a las instrucciones y medidas aplicables al servicio. Las transferencias a terceros para fines propios sólo se realizarán cuando sean necesarias y estén permitidas por la legislación aplicable, comunicando el aviso y obteniendo consentimiento cuando corresponda.

10. Conservación y eliminación
Los datos asociados a la cuenta se conservarán mientras la cuenta permanezca activa y durante el tiempo estrictamente necesario para cumplir las finalidades descritas. Los clientes y socios pueden iniciar la eliminación desde Ajustes > Eliminar cuenta. UCAPSA intentará eliminar de inmediato la cuenta y los datos asociados de la app que no exista obligación legal de conservar.

Si un impedimento legal o técnico impide completar la eliminación de inmediato, la solicitud quedará registrada para su atención. Los datos que deban conservarse por una obligación legal serán bloqueados, no se utilizarán para finalidades incompatibles y se suprimirán cuando concluya el periodo aplicable. No se impone un periodo artificial de espera. UCAPSA puede conservar evidencia desidentificada de que una solicitud de eliminación fue atendida.

La eliminación de la cuenta no elimina documentos fiscales o contables que, en su caso, UCAPSA deba conservar por separado conforme a otras disposiciones y que no formen parte del registro auxiliar de la app.

11. Derechos ARCO y revocación
Administración de UCAPSA es el área responsable de tramitar solicitudes de acceso, rectificación, cancelación y oposición (ARCO). La solicitud puede iniciarse en ucapsa84@gmail.com e indicar: nombre de la persona titular; medio para recibir notificaciones; derecho que desea ejercer; descripción clara de los datos involucrados y cualquier elemento que facilite su localización. UCAPSA verificará la identidad antes de revelar, modificar o cancelar datos. La determinación se comunicará en un plazo máximo de 20 días desde la recepción de la solicitud y, si resulta procedente, se hará efectiva dentro de los 15 días siguientes; ambos plazos pueden ampliarse una sola vez por un periodo igual cuando las circunstancias lo justifiquen, conforme a la LFPDPPP vigente. La eliminación de la cuenta de clientes y socios también puede iniciarse directamente en Ajustes > Eliminar cuenta.

12. Limitación del uso o divulgación
La persona usuaria puede administrar las categorías de notificaciones disponibles desde Ajustes de la app. Para solicitar la limitación de cualquier tratamiento no indispensable, revocar un consentimiento cuando legalmente proceda o plantear una solicitud de privacidad, puede escribir a ucapsa84@gmail.com. Como las finalidades descritas son necesarias para operar la cuenta y los servicios solicitados, limitar tratamientos esenciales puede impedir mantener determinadas funciones; en ese caso la persona puede solicitar la eliminación de su cuenta desde la propia app.

13. Transferencias
UCAPSA no vende datos personales ni los transfiere a terceros para publicidad. Para operar la app utiliza proveedores tecnológicos que actúan como encargados del tratamiento, principalmente Supabase para autenticación, base de datos y funciones; Expo para infraestructura de la aplicación y notificaciones; Apple Push Notification service (APNs) para la entrega de notificaciones en iOS; y Google Firebase Cloud Messaging (FCM) para la entrega de notificaciones en Android. La infraestructura principal de Supabase de UCAPSA App se encuentra actualmente en la región us-west-2 de Estados Unidos, por lo que puede existir tratamiento internacional por encargados. Estos proveedores deben tratar los datos conforme a las instrucciones y medidas aplicables al servicio. Las transferencias a terceros para fines propios sólo se realizarán cuando sean necesarias y estén permitidas por la legislación aplicable, comunicando el aviso y obteniendo consentimiento cuando corresponda.

14. Seguridad
UCAPSA aplica controles de acceso, autenticación, reglas de seguridad en base de datos y separación de privilegios para reducir accesos no autorizados. Ningún sistema es infalible; si UCAPSA identifica una vulneración que afecte de forma significativa los derechos patrimoniales o morales de las personas titulares, actuará conforme a las obligaciones legales aplicables.

15. Cambios al aviso
Los cambios al aviso se comunicarán mediante la versión publicada dentro de UCAPSA App y en https://hrfecmviyiluubymsoeq.supabase.co/functions/v1/privacy-policy. Cuando el cambio sea material y resulte razonable, UCAPSA también podrá comunicarlo mediante un aviso dentro de la app o al correo asociado a la cuenta antes de que el nuevo tratamiento sea aplicable.

16. Versión y vigencia
Versión 1.0 App Store. Vigente a partir del 22 de septiembre de 2026. Marco principal: Ley Federal de Protección de Datos Personales en Posesión de los Particulares, texto vigente con última reforma publicada en el DOF el 14 de noviembre de 2025.$in$,
  timestamptz '2026-09-22 00:00:00-06',
  now(),
  null,
  null,
  now(),
  now()
)
on conflict (version) do update set
  status = 'published',
  responsible_name = excluded.responsible_name,
  responsible_address = excluded.responsible_address,
  contact_email = excluded.contact_email,
  data_categories = excluded.data_categories,
  sensitive_data_categories = excluded.sensitive_data_categories,
  purposes = excluded.purposes,
  consent_required_purposes = excluded.consent_required_purposes,
  limitation_mechanisms = excluded.limitation_mechanisms,
  arco_procedure = excluded.arco_procedure,
  change_notice_method = excluded.change_notice_method,
  transfer_clause = excluded.transfer_clause,
  simplified_notice = excluded.simplified_notice,
  integral_notice = excluded.integral_notice,
  effective_from = excluded.effective_from,
  published_at = now(),
  published_by = null,
  updated_at = now();
