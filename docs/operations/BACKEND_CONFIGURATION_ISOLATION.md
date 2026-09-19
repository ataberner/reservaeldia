# Configuración backend: aislamiento y rotación manual

Status: Operational Diagnostic Evidence. Revisión local: 2026-09-19.

Alcance: configuración de Functions v2, secretos y logging. No se consultaron
valores de Secret Manager ni recursos remotos. No hubo deploy, envío de email,
rotación ni cambios IAM. El 2026-09-19 se retiraron exclusivamente las tres
variables sensibles de Mercado Pago del dotenv local de Functions, sin cambiar
sus credenciales ni la configuración normal restante.
El estado remoto de email es el informado por el operador, no una verificación
remota de esta revisión. La lógica de pagos y validación HMAC permanece igual.

**Cierre de emails, 2026-09-18:** el operador confirmó el envío sandbox exitoso;
ver [el runbook de Fase 1](TRANSACTIONAL_EMAIL_SANDBOX_RUNBOOK.md). Esta validación
no cierra la migración/rotación de Mercado Pago ni el aislamiento del entorno.
Se conservan los cambios locales ya aprobados; no se rotaron credenciales ni se
desplegaron Functions de pagos durante el cierre.

## Hechos y causa

- `firebase.json` tiene una sola codebase `default`, con source `functions`.
- La CLI instalada, Firebase CLI 14.4.0, lee `.env` y `.env.<project/alias>` del
  source y copia su mapa a **cada endpoint**. Ver `lib/functions/env.js:213` y
  `lib/deploy/functions/prepare.js:77-100` de la instalación de firebase-tools.
  El filtro `--only functions:testTransactionalEmail` limita endpoints a desplegar,
  no variables del entorno. No hace análisis de consumidores de cada variable.
- `defineString` valida/parametriza configuración; no crea aislamiento por función.
  `secrets: [...]` vincula secretos por función; no elimina variables dotenv.
- Antes de este ajuste, el enumerador real usado por el empaquetador incluía
  `.env.production`, `.env.reservaeldia-7a440` y `.secret.local.example`. Se
  comprobó enumerando nombres, sin construir/subir un ZIP ni imprimir contenidos.
  `.gitignore` no es la lista de exclusión de Firebase. Ahora `firebase.json`
  excluye `.env*`, `.secret*` y `.runtimeconfig.json` del paquete fuente.
  **Esto no impide la inyección dotenv**: la lectura de entorno es independiente.
- `.env.production` no se selecciona por `NODE_ENV=production`; requiere el alias
  correspondiente. `.firebaserc` solo declara `default`. Para el comando con
  `--project reservaeldia-7a440`, el archivo relevante es el de ese project ID.

Referencia: [Firebase: configuración de entorno](https://firebase.google.com/docs/functions/config-env).

**Inferencia:** el entorno ajeno observado en la revisión de Cloud Run es el
resultado esperado de ese modelo de deployment. No hace falta que el sender
importe Mercado Pago ni que la service account acceda a sus secretos: los valores
dotenv ya llegan como variables ordinarias. El paquete anterior también podía
llevar esos archivos. No se descargaron revisiones ni paquetes remotos para
certificar qué versiones históricas los contienen.

## Inventario sin valores

A = pública/no sensible; B = backend no secreta; C = secreto. D indica el ámbito
específico y se combina con A/B/C, no reemplaza la clasificación de sensibilidad.

| Nombre | Clase | D: ámbito / consumidor | Fuente observada y destino recomendado |
| --- | --- | --- | --- |
| `SUPERADMINS_UIDS` | B, restringida administrativamente | Autorización, `auth/adminAuth.ts` | `.env.reservaeldia-7a440`; conservada sin cambios. No publicar ni loguear la lista. |
| `MERCADO_PAGO_PUBLIC_KEY` | A | Checkout, se devuelve al browser | `.env.reservaeldia-7a440`; configuración normal conservada sin cambios. |
| `MERCADO_PAGO_ACCESS_TOKEN` | C | Tres Functions de pagos | Retirada de dotenv. Secret Manager según confirmación del operador; `defineSecret` y bindings locales verificados. Deploy pendiente. |
| `MERCADO_PAGO_CLIENT_ID` | A | Sin consumidor en código mantenido | `.env.reservaeldia-7a440`; conservada sin cambios por alcance del pedido. |
| `MERCADO_PAGO_CLIENT_SECRET` | C | Sin consumidor en el repositorio | Retirada de dotenv. Sin declaración ni binding; no crear un Secret para estas Functions. Rotación posterior pendiente, fuera de esta migración local. |
| `MERCADO_PAGO_WEBHOOK_URL` | B | Creación de preferencia/pago | `.env.reservaeldia-7a440`; configuración normal conservada sin cambios. |
| `MP_WEBHOOK_SECRET` | C | `mercadoPagoWebhook` | Retirada de dotenv. Secret Manager según confirmación del operador; `defineSecret` y binding local verificados. Deploy pendiente. |
| `GOOGLE_MAPS_EMBED_API_KEY` | A, identificador de API restringido | Render HTML y validación | `.env.reservaeldia-7a440`, `.env.production`; conservada sin cambios. Termina en iframe público; mantener restricciones de API/referrers. |
| `EMAIL_MODE` | B | Email | `.env.reservaeldia-7a440`; conservada sin cambios. `defineString`, default bloqueado; sandbox en la revisión inicial. |
| `AWS_SES_ACCESS_KEY_ID` | C, parte del par de credenciales | Solo email | `emails/config.ts`, Secret Manager según el operador; conservar binding específico. |
| `AWS_SES_SECRET_ACCESS_KEY` | C | Solo email | Igual que el anterior. |
| `OPENAI_API_KEY` | C | `designerAiChat` | `defineSecret` y binding existentes; además hay nombre en `.secret.local:1` y `.secret.local.example:1`. No se inspeccionó su valor. |
| `PUBLIC_VISIT_SIGNING_SECRET` | C | `verInvitacionPublicada` | `defineSecret` y binding existentes. |
| `CLOUD_RUNTIME_CONFIG` → `superadmins.uids` | B para ese campo; contenedor potencialmente sensible | Fallback administrativo | También existe `.runtimeconfig.json`; no se debe imprimir el contenedor. No migrar ni alterar la política administrativa aquí. |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | A, API key restringida | Places/Maps JavaScript/Static del editor; fallback Embed backend | `.env.local:22` de la raíz; separar de la key Embed. |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | A | Analytics frontend | `.env.local:19` de la raíz. |
| `NEXT_PUBLIC_FIREBASE_MODE` | A | Selección del entorno frontend | `.env.local:21` de la raíz. |

Los `.env` de la raíz de Next.js no son el source dotenv de Functions. La búsqueda
de Client ID/Secret se realizó sobre `src`, `functions/src`, `scripts` y `shared`;
su ausencia allí no demuestra ausencia de integraciones externas al repositorio.

También existen opciones B/D leídas por código, pero **no declaradas en los dotenv
de Functions inspeccionados**: `ICONOS_V2_ENABLED`, `ICONOS_V2_ENFORCEMENT`,
`ICONOS_V2_AUTO_NORMALIZE_SAFE`, `ICONOS_V2_AUTO_NORMALIZE_CURRENTCOLOR`,
`DECOR_V1_ENABLED`, `DECOR_V1_ENFORCEMENT`, `PUBLISH_SHARE_IMAGE_ENABLED`,
`PUBLISH_SHARE_IMAGE_DEFAULT_URL`, `PUPPETEER_EXECUTABLE_PATH`,
`PRICING_CONFIG_ALLOW_LEGACY_FALLBACK`, `COUNTDOWN_NEW_RENDERER_ENABLED`,
`COUNTDOWN_NEW_LIFECYCLE_ENABLED`, `COUNTDOWN_NEW_CATALOG_ENABLED` y
`COUNTDOWN_NEW_TEMPORAL_SYSTEM_ENABLED` (estos cuatro tienen variante
`NEXT_PUBLIC_`, clase A). No convertir feature flags en secretos.

`NODE_ENV`, `NODE_TEST_CONTEXT`, `FUNCTIONS_EMULATOR`, `GCLOUD_PROJECT`,
`GOOGLE_CLOUD_PROJECT`, `FIREBASE_CONFIG`, `FIREBASE_STORAGE_BUCKET`,
`FIREBASE_AUTH_EMULATOR_HOST`, `FIRESTORE_EMULATOR_HOST`,
`FIREBASE_STORAGE_EMULATOR_HOST`, `FIREBASE_FUNCTIONS_EMULATOR_HOST`,
`STORAGE_EMULATOR_HOST`, `RESERVA_FIREBASE_MODE`, `RESERVA_LOCAL_SESSION` y `HOME`
son parámetros de plataforma/aislamiento local (B/D), no secretos de aplicación.
`GOOGLE_APPLICATION_CREDENTIALS` apunta a credenciales: el path no es el secreto,
su contenido sí. El backend local rechaza ADC explícitas. No copiarlo a dotenv.

## Cambios locales y límite de aislamiento

**Las Functions continúan compartiendo una única codebase/source; la separación
completa de configuración normal por subsistema queda pendiente.** Esta deuda es
independiente del cierre funcional de SES. La preparación local de la migración
de `MERCADO_PAGO_ACCESS_TOKEN` y `MP_WEBHOOK_SECRET` quedó completada el
2026-09-19: bindings preparados y dotenv saneados. El operador confirmó la carga
manual de los Secrets; no se consultaron sus valores ni se verificó estado remoto.
El despliegue y la posterior rotación siguen pendientes y fuera de este cambio.

Implementado localmente:

1. Declaraciones `defineSecret` en `payments/mercadoPagoClient.ts` para Access Token
   y firma webhook. Sus lecturas existentes de `process.env` siguen siendo lazy;
   Firebase también inyecta los secretos vinculados con esos mismos nombres.
   No cambian SDK, caché, timeouts, errores al cliente, firmas ni reglas de pagos.
2. Bindings mínimos en `index.ts`: Access Token en checkout, creación de pago y
   webhook; firma solo en webhook. No se agregan secretos globales.
3. Exclusión de archivos de configuración del paquete fuente.
4. Logs de error de webhook, entrega/subida de Storage en index y normalización
   de assets de plantilla usan `utils/safeErrorLog.ts`: solo tipo genérico y
   status numérico. No serializan mensaje, stack, request, response ni headers.
5. Tests de bindings, descubrimiento sin leer secretos, contrato de lectura,
   errores sintéticos con credenciales, HTTP conservado y ausencia de red.

**Preparación local completada, 2026-09-19:** se eliminaron Access Token,
Webhook Secret y Client Secret de `functions/.env.reservaeldia-7a440`, único
dotenv donde estaban declarados. `functions/.env.production` y `.env.local` de la raíz
no contienen esas declaraciones y no se modificaron. Se conservaron byte a byte
las líneas restantes del dotenv, incluidos Public Key, Client ID, Webhook URL,
superadmins, Maps y modo de email. No se generó un backup con secretos.
El dotenv está ignorado por Git: esta limpieza local no viaja en el diff versionado.
La nueva prueba de `runtimeConfiguration.test.mjs` detecta la reintroducción de cualquiera
de los tres nombres en `.env` o `.env.*` de Functions; sus errores muestran solo
nombres. El despliegue sigue pendiente: no se afirma un cambio en producción.

**Recomendación:** primero sacar todos los secretos de dotenv usando los bindings
nativos. Para el requisito adicional de que email tampoco reciba configuración
normal de Maps/pagos/admin, separar por subsistema las codebases **y sus directorios
source**, cada uno con dotenv propio y permisos de runtime mínimos. Reutilizar el
mismo servicio `emails`; no duplicar el sender. Poner dos codebases sobre el mismo
source o mover exports entre archivos no aísla el entorno. Es una segunda fase
de empaquetado/deployment aún no implementada, que necesita verificar el traslado
de la función existente sin borrarla ni duplicarla. Las variables gestionadas por
la plataforma seguirán presentes incluso con aislamiento correcto.

No usar `delete process.env`, ni variar dotenv según `--only`, ni parches manuales
a revisiones Cloud Run como fuente permanente de configuración. Los redeploys
volverían a introducir configuración o producirían deriva entre Functions.

Referencia: [Firebase: codebases](https://firebase.google.com/docs/functions/organize-functions).
Los bindings no reemplazan IAM: revisar por separado que cada identidad de runtime
no tenga `secretAccessor` global/heredado. No se consultó ni cambió IAM remoto.

## Consumidores y redeploy requerido

| Credencial/configuración que cambia | Functions consumidoras que requieren redeploy |
| --- | --- |
| `MERCADO_PAGO_ACCESS_TOKEN` | `createPublicationCheckoutSession`, `createPublicationPayment`, `mercadoPagoWebhook` |
| `MP_WEBHOOK_SECRET` | `mercadoPagoWebhook` |
| `MERCADO_PAGO_CLIENT_SECRET` | Ninguna consumidora encontrada. Rotar en MP no necesita desplegar estas Functions por dependencia. Sí limpiar revisiones que lo recibieron como env. |
| `MERCADO_PAGO_PUBLIC_KEY` | `createPublicationCheckoutSession` |
| `MERCADO_PAGO_WEBHOOK_URL` | `createPublicationCheckoutSession`, `createPublicationPayment` |
| AWS SES, cualquiera de los dos secretos | `testTransactionalEmail` |
| `OPENAI_API_KEY` | `designerAiChat` |
| `PUBLIC_VISIT_SIGNING_SECRET` | `verInvitacionPublicada` |
| `GOOGLE_MAPS_EMBED_API_KEY` | `validateDraftForPublication`, `prepareDraftPreviewRender`, `preparePublicTemplatePreview`, `adminGetTemplateEditorDocumentV1`, `createPublicationCheckoutSession`, `createPublicationPayment`, `mercadoPagoWebhook`, `retryPaidPublicationWithNewSlug`, `publicarInvitacion` |

Trazas: `mercadoPagoClient.ts` → `publicationPayments.ts` (preferencia, creación
de pago, consulta por ID y validación HMAC) → exports de `index.ts`. Los demás
reintentos/publicación usan sesiones persistidas; no requieren credenciales MP.
Maps: `prepareRenderPayload.ts`, `generarHTMLDesdeObjetos.ts`,
`publicationPublishExecution.ts`, `templateEditorPreview.ts`, más preview público
directo de `index.ts`. La validación de checkout también lee la key de Maps.

La matriz distingue **consumo funcional** de **eliminación de copias expuestas**:
para sanear estas últimas hay que redeployar todas las Functions/revisiones que
hayan recibido el dotenv anterior, aunque no consuman las variables. El inventario
remoto de esas revisiones está pendiente. Un deploy dirigido de email no limpia
las demás. Mantener un dotenv no sensible seleccionado: la CLI instalada conserva
envs existentes cuando no detecta ningún dotenv (`prepare.js:197`). Revisar
revisiones antiguas, artefactos y logs compartidos; rotar invalida credenciales,
un redeploy no borra sus copias históricas. No borrar versiones en uso.

## Mercado Pago: procedimiento manual

No ejecutar estos pasos automáticamente. Los comandos no contienen valores.
Introducirlos solo en el prompt oculto de Firebase; no usar argumentos con valores,
`echo`, transcripciones, `--debug`, `secrets:access` ni `gcloud secrets versions access`.
Si `functions:secrets:set` ofrece redeployar y destruir la versión anterior,
contestar **No**: se desplegará explícitamente después; no usar `--force`.

### Migrar almacenamiento antes de rotar

Estado al 2026-09-19: paso 2 informado como realizado manualmente por el operador;
paso 3 ejecutado y verificado localmente. No repetir la carga ni rotar como parte
de esta preparación. Los pasos remotos siguientes no se ejecutaron.

1. Tener listo este código y sus checks. Identificar en el panel MP la misma
   aplicación/cuenta que usa el checkout. No cambiar Public Key ni webhook URL.
2. Registrar las credenciales vigentes en Secret Manager, sin rotarlas todavía:

   ```powershell
   firebase functions:secrets:set MERCADO_PAGO_ACCESS_TOKEN --project reservaeldia-7a440
   firebase functions:secrets:set MP_WEBHOOK_SECRET --project reservaeldia-7a440
   ```

3. Retirar manualmente `MERCADO_PAGO_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` y
   `MERCADO_PAGO_CLIENT_SECRET` de `functions/.env.reservaeldia-7a440` y de cualquier
   otro dotenv seleccionable. Conservar las configuraciones normales necesarias.
   No agregar las nuevas credenciales a `.env`, frontend, Firestore o Git.
4. Desplegar solo los consumidores (la CLI necesita poder vincular el acceso a los
   dos Secrets a la identidad de pagos, sin otorgarlo a la identidad de email):

   ```powershell
   firebase deploy --only "functions:createPublicationCheckoutSession,functions:createPublicationPayment,functions:mercadoPagoWebhook" --project reservaeldia-7a440
   ```

5. Verificar bindings/versiones e identidad con una proyección que no muestre envs:

   ```powershell
   gcloud functions describe mercadoPagoWebhook --gen2 --region=us-central1 --project=reservaeldia-7a440 --format="json(name,serviceConfig.serviceAccountEmail,serviceConfig.secretEnvironmentVariables.key,serviceConfig.secretEnvironmentVariables.version)"
   ```

   Repetir la proyección para los dos callables. Comprobar salud del checkout y
   notificaciones legítimas. Esta auditoría no realizó un cobro ni replay.

### Access Token y Client Secret expuestos

6. En MP: Tus integraciones → aplicación correcta → Credenciales de producción →
   Más opciones → Renovar Access Token. La documentación publica una convivencia
   de 12 horas para credenciales de producción: confirmar la ventana que muestre
   la aplicación concreta antes de rotar. Es una ventana para desplegar, no una
   garantía para el secreto HMAC del webhook.
7. Crear la nueva versión mediante `functions:secrets:set MERCADO_PAGO_ACCESS_TOKEN`
   con el mismo `--project`; contestar No al redeploy automático y ejecutar el
   deploy dirigido de los tres consumidores del paso 4 dentro de esa ventana.
   Las instancias nuevas inicializan su caché del SDK con la nueva versión.
8. Verificar los tres consumidores y completar la retirada del token anterior en
   MP al terminar la transición. Ante fallos, no seguir rotando otros secretos;
   resolver antes del vencimiento. No hacer rollback a una credencial ya revocada.
9. Renovar también Client Secret en el panel MP. No tiene consumidor en este
   repositorio: no crear ni vincular `MERCADO_PAGO_CLIENT_SECRET` aquí. Si otros
   servicios usan OAuth, coordinarlos primero y actualizar su almacén de secretos.

[Fuente de la ventana y renovación MP](https://www.mercadopago.com.ar/developers/es/docs/checkout-api-payments/best-practices/credentials-best-practices/secure-credentials?scope=prod).

### Firma webhook: límite de continuidad

10. Rotarla por separado. `mercadoPagoWebhookEdge.ts` valida contra una sola clave.
    La documentación de Webhooks permite Restablecer pero no especifica una
    convivencia equivalente a las 12 horas. **No existe un procedimiento probado
    de cero interrupción con el código actual.** Si eso es obligatorio, detenerse
    antes de Restablecer hasta acordar con MP una transición soportada o diseñar
    una migración adicional. No desactivar la validación de firma.
11. Si el operador acepta una ventana controlada: preparar despliegue y monitoreo,
    restablecer firma en MP, registrar inmediatamente su nueva versión y desplegar
    exclusivamente el webhook:

    ```powershell
    firebase functions:secrets:set MP_WEBHOOK_SECRET --project reservaeldia-7a440
    firebase deploy --only functions:mercadoPagoWebhook --project reservaeldia-7a440
    ```

    Contestar No al redeploy automático. Durante el cambio puede haber 401 y
    retrasos de confirmación/publicación; no afirmar que esto es cero downtime.
    MP documenta reintentos, pero no se verificó aquí cómo firma notificaciones
    pendientes tras la rotación. Revisar el historial de notificaciones y pagos
    de la ventana; no reenviar indiscriminadamente por la deuda de idempotencia
    preexistente, que no cambia en esta tarea.

[Fuente: Webhooks MP](https://www.mercadopago.com.ar/developers/es/docs/checkout-api-payments/additional-content/your-integrations/notifications/webhooks).

## Google Maps: procedimiento manual

1. `GOOGLE_MAPS_EMBED_API_KEY` se lee en backend pero se inserta como `key` en
   `https://www.google.com/maps/embed/v1/place` del HTML visible al visitante.
   Secret Manager no puede ocultarla al navegador. Usar una key dedicada a Embed.
2. En Google Cloud Console → APIs & Services → Credentials → key correspondiente:
   API restrictions: **Maps Embed API** únicamente. Application restrictions:
   **Websites / HTTP referrers**, con los orígenes reales de las invitaciones,
   inicialmente `https://reservaeldia.com.ar/*`; agregar `www`, hosts propios
   Firebase Hosting y previews únicamente si realmente sirven ese iframe.
   No autorizar `*.web.app`, `*.firebaseapp.com` ni `*.cloudfunctions.net` globales.
   El iframe ya usa `referrerpolicy="no-referrer-when-downgrade"`; verificar el
   Referer efectivo de previews y páginas publicadas antes de cerrar la lista.
3. No restringir esta key por IP del backend: la solicitud a Embed sale del browser.
   Para localhost usar una key separada de desarrollo con referrers específicos.
4. `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` es otra configuración de browser: consume
   Maps JavaScript/Places (`src/domain/eventDetails/googlePlaces.js`) y Static
   (`googleMapsStatic.js`). Mantenerla separada con Websites y solo las APIs que
   consume (Maps JavaScript, Places correspondiente, Maps Static). Verificar si
   actualmente es la misma key en la consola; no se compararon/imprimieron valores.
5. Si solo cambian restricciones: no necesita redeploy. Si cambia el valor de
   Embed: actualizar configuración normal y redeployar la lista Maps de la matriz.
   Si cambia la key `NEXT_PUBLIC_`: rebuild/deploy frontend manual.
6. El HTML ya publicado conserva la key anterior; cambiar un env y redeployar no
   reescribe Storage. Mantener la antigua restringida mientras se prepara y valida
   una regeneración controlada de esos HTML, antes de revocarla. Esa migración de
   publicaciones no se ejecutó ni se incluyó en este cambio.

Comando dirigido para un cambio de valor de Embed, **después** de completar la
migración de secretos y preparar la transición de los HTML existentes:

```powershell
firebase deploy --only "functions:validateDraftForPublication,functions:prepareDraftPreviewRender,functions:preparePublicTemplatePreview,functions:adminGetTemplateEditorDocumentV1,functions:createPublicationCheckoutSession,functions:createPublicationPayment,functions:mercadoPagoWebhook,functions:retryPaidPublicationWithNewSlug,functions:publicarInvitacion" --project reservaeldia-7a440
```

Después de sanear dotenv, actualizar solo la revisión de email (sin invocarla)
requiere el comando siguiente. Seguirá recibiendo variables **no secretas** ajenas
hasta la separación de source indicada arriba:

```powershell
firebase deploy --only functions:testTransactionalEmail --project reservaeldia-7a440
```

[Guía oficial de seguridad Maps](https://developers.google.com/maps/api-security-best-practices#websites-with-the-maps-embed-api).

## Logs, email y verificación

No se encontró un dump explícito de `process.env` completo en el código mantenido.
Sí había errores SDK crudos en las cuatro rutas corregidas. La prueba con un error
sintético que contiene Authorization, mensaje, stack, URL y payload demuestra que
ya no se emiten esos campos. Esto no demuestra que un secreto real se haya
registrado anteriormente: la exposición informada fue por la salida operativa de
gcloud. No certifica todos los logs: hay otros logs legacy de errores/URLs y reportes
de cliente (por ejemplo `index.ts` y `iconCatalog/audit.ts`) que requieren una
revisión focalizada si se pretende imponer una política global de sanitización.

Nunca compartir dumps de entorno/revisión, errores SDK completos, Authorization,
cookies, `x-signature`, tokens de tarjeta, AWS/MP/OpenAI Secrets, claves HMAC,
payloads completos de solicitudes, URLs firmadas o URLs con `token`, ni la lista
de superadmins. Usar nombres, versiones, status, IDs de correlación y métricas;
las API keys públicas tampoco necesitan aparecer en logs de diagnóstico.

Email conserva dos bindings AWS exclusivamente, IAM privado y su service account
dedicada, destinatario/template/datos fijos. Su módulo no lee credenciales MP/Maps.
El entrypoint compartido sí importa otros subsistemas, incluidos módulos que leen
feature flags en module scope (`iconCatalog/config.ts`, `decorCatalog/config.ts`).
No equivale a un proceso que solo cargue configuración de email; separar su source
y entrypoint también deberá aislar ese grafo de imports.
`EMAIL_MODE` sigue parametrizado, disabled por defecto, sandbox permitido y
production bloqueado. **No afirmar que su entorno desplegado ya está aislado**:
el dotenv local ya está saneado, pero no se desplegó y aún falta separar source
para configuración normal. La limpieza local no modifica revisiones existentes.

Checks de la revisión previa (2026-09-18) con Node 20, desde `functions/`,
sin correo ni consultas remotas:

```powershell
npm run build
npm run typecheck
node --require ../scripts/local/networkGuard.cjs --test runtimeConfiguration.test.mjs transactionalEmail.test.mjs mercadoPagoWebhookEdge.test.mjs publicationPaymentEdge.test.mjs templateStorageAssets.test.mjs
npx --no-install eslint src/index.ts src/payments/mercadoPagoClient.ts src/payments/publicationPayments.ts src/templates/storageAssets.ts src/utils/safeErrorLog.ts runtimeConfiguration.test.mjs
git diff --check
```

Las suites nuevas y de email bloquean red; el resto usa fakes de Firebase/SDK y
el preload local bloquea sockets externos. El test de email usa handlers con
transporte fake: nunca se invoca la Function desplegada ni se crea un envío SES real.

Resultado local: 51 tests aprobados (6 configuración/logs, 34 email, 10 bordes
pagos/webhook y 1 assets de plantilla); build y typecheck aprobados; lint de los
archivos modificados sin errores, con 28 warnings preexistentes (comparados con
HEAD: index 18, publicationPayments 9, storageAssets 1). `git diff --check` sin
errores; también se comprobaron espacios finales en los archivos nuevos.

### Verificación de la migración local, 2026-09-19

Se verificaron nuevamente las declaraciones `defineSecret` y los metadatos de
todos los exports compilados: Access Token únicamente en los dos callables de
pago y el webhook; Webhook Secret únicamente en el webhook; Client Secret sin
consumidores ni bindings. Email conserva exclusivamente sus dos Secrets de AWS.
No se modificó código de pagos, HMAC, webhook ni email.

La prueba nueva de dotenv falló antes de la limpieza mostrando solo los tres
nombres y pasó después. La comparación exacta en memoria contra las credenciales
locales retiradas cubrió 11.256 archivos (versionables y configuración local),
sin copias restantes, sin imprimir valores ni persistirlos como evidencia.
La búsqueda adicional en 10.980 archivos de texto versionables, incluida
documentación y fixtures, no encontró literales con formato de Access Token MP.
Las referencias restantes son declaraciones/lecturas, documentación y pruebas
sintéticas. No se inspeccionaron historial Git, Secret Manager ni recursos remotos.

Desde `functions/`, con Node 22.13.1 disponible en esta máquina:

```powershell
npm.cmd run build
npm.cmd run typecheck
node --require ../scripts/local/networkGuard.cjs --test runtimeConfiguration.test.mjs transactionalEmail.test.mjs sesDiagnostics.test.mjs mercadoPagoWebhookEdge.test.mjs publicationPaymentEdge.test.mjs publicationPaymentReads.test.mjs publicationCheckoutConfig.test.mjs publicationCheckoutSessionFlow.test.mjs publicationApprovedSessionFlow.test.mjs
node node_modules/eslint/bin/eslint.js runtimeConfiguration.test.mjs
git diff --check
```

Resultado: **90/90 tests aprobados**, sin omisiones; build aprobado, 48 copias
compartidas verificadas y ninguna resincronización necesaria; typecheck aprobado;
lint del test modificado con cero errores y cero warnings; `git diff --check`
aprobado. Aviso no bloqueante de Node: deprecación de `punycode`.
No se repitió esta ejecución con Node 20, runtime declarado por Functions.
El log local de tests está en `.local-isolation/mp-secret-migration-tests.tap`
(ignorado por Git). No hubo deploy, invocaciones remotas, envíos ni rotaciones.
