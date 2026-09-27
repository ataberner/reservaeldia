# Configuración backend: aislamiento y rotación manual

Status: Operational Diagnostic Evidence. Diagnóstico inicial: 2026-09-19;
cierre Payments: 2026-09-24; cierre WelcomeEmail hasta sandbox: 2026-09-26.

**Preparación productiva local de email, 27/09/2026:** SES production access
confirmado por el operador. El código admite production y agrega un aviso
interno independiente; el dotenv continúa sandbox con activación vacía. No se
modifican Secrets, identidades, IAM ni configuración remota. Ver [corte, Rules
previas y rollback](TRANSACTIONAL_EMAIL_SANDBOX_RUNBOOK.md#produccion-registration-emails).

Alcance: configuración de Functions, secretos y logging. La revisión inicial
no consultó recursos remotos. El cierre de email del 26/09 agrega lecturas
sanitizadas de metadata, logs y un delivery; nunca valores de Secret Manager
ni entornos completos. No hubo deploy, envío de email, rotación ni cambios IAM
por parte del agente. El 2026-09-19 se retiraron exclusivamente las tres
variables sensibles de Mercado Pago del dotenv local de Functions, sin cambiar
sus credenciales ni la configuración normal restante.
El estado remoto de email del 26/09 se verifica en el
[cierre sandbox](TRANSACTIONAL_EMAIL_SANDBOX_RUNBOOK.md#cierre-welcome-sandbox).
La lógica de pagos y validación HMAC permanece igual.

**Revalidación del 27/09/2026:** ver
[reconciliación de Functions y Email](FUNCTIONS_STAGE2_RECONCILIATION.md).
Email conserva el aislamiento esperado y no requiere repetir la migración.
El trigger histórico generatePublishedShareImage, clasificado obsoleto, conserva
nombres sensibles MP en su entorno heredado, sin bindings Secret Manager.
Se documentaron solo nombres; no se copiaron valores ni se modificó el recurso.
Ese snapshot fue seguido por el [retiro controlado](DEFAULT_DEPLOY_READINESS.md)
del único trigger obsoleto, sin restaurar su entorno: remoto final 101/3/3 (107).
Esa captura inicial no auditó el dotenv remoto de todo default. La reconciliación
posterior, abajo, compara los nombres y los valores preservados en memoria sin
guardar ni imprimir valores del entorno.

<a id="default-environment"></a>

## Entorno de default: consumidores y decisión aceptada, 2026-09-27

**DECISIÓN aceptada:** por el pedido de reconciliación del entorno, las seis
variables MP remotas se clasifican como heredadas/obsoletas de default. No se
reincorporan al source. Su eliminación en el próximo deploy autorizado es
intencional. `EMAIL_MODE`, sin consumidor core, se elimina exclusivamente de
`functions/.env.reservaeldia-7a440`. No se hace deploy en esta tarea.
El archivo compartido anterior a la separación de Email aún conservaba el modo,
y la política inicial toleraba explícitamente ese residuo. Por eso el CLI podía
inyectarlo; no provenía de un consumidor ni parámetro de default.
La autoridad y allowlist están en
[Functions ownership](../architecture/FUNCTIONS_CODEBASE_OWNERSHIP.md#default-environment)
y su registro; esta matriz conserva la evidencia de consumidores.

**HECHOS de source:** se siguieron los 101 exports del entrypoint default, sus
imports transitivos (114 módulos resueltos) y referencias de funciones, y se
revisaron manualmente los callbacks/flujo de aprobación. No hay lectura directa
ni camino efectivo desde esos endpoints hacia los siete lectores evaluados.
El análisis estático no se presenta como ejecución de todos los caminos.

| Variable | Consumidor efectivo en default | Consumidor en payments | Consumidor en email | Necesaria en default |
| --- | --- | --- | --- | --- |
| MERCADO_PAGO_ACCESS_TOKEN | Ninguno | Los tres endpoints, mediante getMercadoPagoClient; binding por endpoint | Ninguno | No |
| MERCADO_PAGO_CLIENT_SECRET | Ninguno | Ninguno | Ninguno | No |
| MP_WEBHOOK_SECRET | Ninguno | mercadoPagoWebhook, verificación HMAC mediante getMercadoPagoWebhookSecret | Ninguno | No |
| MERCADO_PAGO_CLIENT_ID | Ninguno | Ninguno | Ninguno | No |
| MERCADO_PAGO_PUBLIC_KEY | Ninguno | createPublicationCheckoutSession, respuesta para el cliente | Ninguno | No |
| MERCADO_PAGO_WEBHOOK_URL | Ninguno | createPublicationCheckoutSession y createPublicationPayment, notification_url | Ninguno | No |
| EMAIL_MODE | Ninguno | Ninguno | testTransactionalEmail, testWelcomeEmail y onUserCreatedWelcomeEmail | No |

Recorridos comprobados:

- `index.ts:17` importa helpers de `publicationPayments.ts`; ese módulo importa
  los getters de `mercadoPagoClient.ts` desde `publicationPayments.ts:43`. Los lectores
  reales están en `mercadoPagoClient.ts:11-57`, son lazy y no se ejecutan al importar.
  Sus únicos callers de proveedor son `createMercadoPagoPreferenceForCheckout`
  (`publicationPayments.ts:727`), los handlers checkout/pago (`:2047`, `:2191`)
  y webhook (`:2517`), exportados desde `payments/entrypoint.ts`.
- `publicarInvitacion` llama a `publishWithApprovedPaymentSession` (`:2450`),
  y el reintento a `retryPaidPublicationWithNewSlugHandler` (`:2369`): ambos
  validan la sesión persistida y llegan a `finalizeApprovedSession` (`:1561`).
  Éste publica/renderiza con `finalizeApprovedSessionFlow`; no cobra, consulta
  pagos remotos ni llama a los getters del proveedor. El estado checkout y
  mantenimiento restantes usan Firestore/Storage, no credenciales MP.
- `mercadoPagoClient.ts:8-9` declara dos `defineSecret` que aparecen en los
  parámetros de discovery de default por ese import compartido. Ninguno es un
  binding de sus 101 endpoints ni se resuelve al importar. No se refactoriza
  ese módulo compartido para cambiar la presentación de parámetros.
- `emails/config.ts:15` declara `emailMode`; `sendTransactionalEmail.ts:78`
  lee `.value()` al enviar. Los dos smokes llegan al sender por imports lazy;
  el procesador Welcome (`welcomeRegistration.ts:153`) y sus guards consultan
  el mismo modo. No hay módulo `emails/` en el árbol runtime de imports de
  default ni de payments. Importar un tipo de request no crea ese consumo.
- No hay lectores de `MERCADO_PAGO_CLIENT_ID` ni `MERCADO_PAGO_CLIENT_SECRET`
  en el source mantenido ni en los contratos compartidos.

**Entorno que se preserva:** los dos nombres normales de la allowlist actual
(Maps y autoridad administrativa), con igualdad de valores verificada en memoria,
y los bindings legítimos de OpenAI/visitas. No se cambian sus valores/versiones.
La configuración propia de payments/email y sus archivos dotenv permanecen
independientes y sin modificaciones. El entorno sintético del emulador combinado
no es el entrypoint productivo y conserva sus protecciones de no envío.

**Guardrail existente extendido:** `assertSourceConfigurationNames` reutiliza
`assertConfigurationNames` y el registro único. El gate lo llama antes de copiar
fuentes sin dotenv; el predeploy también comprueba su source. Las pruebas usan
fixtures sin credenciales, rechazan variables de otro owner/desconocidas y
comprueban que el error sólo contiene nombres. Los parámetros normales del
manifest se verifican por la misma allowlist; no se confunden con Secret bindings.

**Preflight remoto, 2026-09-27T17:27:47.741Z:** los 107 endpoints siguen ACTIVE,
101/3/3, sin endpoints desconocidos. Usando el lector dotenv de Firebase CLI
14.4.0 para el proyecto explícito y los manifests reales, el deploy de default
retiraría exactamente las seis variables MP en sus 101 endpoints, agregaría
cero variables y no cambiaría valores preservados. `EMAIL_MODE` no se agregaría.
Payments/Email coinciden con sus propios dotenv y bindings. Las seis versiones
Secret distintas referenciadas entre las tres codebases están ENABLED. Sólo se
consultó metadata de Secret Manager.
No se ejecutó `deploy`, `prepare` ni `deploy --dry-run`, ni se invocaron handlers.
La evidencia sanitizada local está en
`.local-isolation/default-environment-2026-09-27/remote-environment.json`.

La captura final de metadata (`2026-09-27T17:42:03.401Z`) conserva los 107 ACTIVE,
sin cambios respecto del inicio ni reaparición de `generatePublishedShareImage`.
La selección calculada con el CLI es exclusivamente default (101); los 12
maxInstances explícitos coinciden con producción. No hay drift nuevo de opciones:
se mantienen los 90 defaults de plataforma ya explicados en el cierre anterior.
Evidencia: `remote-unchanged.json` y `preflight.json` en el mismo directorio local.

**Verificación local de esta reconciliación:**

- `node scripts/local/verifyFunctionsOwnership.cjs --cli <CLI fijada 14.4.0>`:
  tres builds y **41/41** pruebas de ownership/packages/configuración/discovery
  aprobadas. Discovery real: **101/3/3**, unión **107**, cero duplicados,
  desconocidos o faltantes. Los 107 registros de endpoint/hashes no cambiaron.
- `tsc --noEmit --project` para `tsconfig.json`, `tsconfig.payments.json` y
  `tsconfig.email-package.json`: **3/3**. Publicación/share:
  `publicationPublishExecution.test.mjs` y `publicDeliveryRoutes.test.mjs`,
  **49/49**. `node functions/scripts/checkDeployReadiness.cjs default`: exit 0,
  sin blockers registrados y con los nombres del dotenv original permitidos.
- Los primeros intentos del gate normal `node scripts/local/runLocal.cjs verify`
  **no quedaron aprobados** (histórico anterior al cierre de estabilidad abajo).
  El primer intento se bloqueó en tooling y Windows denegó la limpieza dentro
  del sandbox; se cerró exclusivamente su árbol propio con permisos locales.
  La repetición pasó tooling (7/7), pero agotó el plazo de 45 s de watch durante
  dos compilaciones de guardados rápidos. El mismo test de contratos, aislado
  y sin modificar sus plazos, pasó después **29/29**. En el último de esos intentos
  previos, el test de inicialización lazy de JSDOM agotó su `spawnSync` de 30 s:
  **40/41**, salida 1; las etapas posteriores no se ejecutaron. No se atribuyen
  estas fallas a cambios funcionales ni se ocultan mediante expectativas nuevas.
- Evidencia de los intentos: bajo
  `.local-isolation/default-env-validation-eZdkeP/workspace/.local-isolation/reports/`,
  `run-DzCKcd` y `run-AQG7lP`; intento previo desde el repositorio:
  `.local-isolation/reports/run-DvLZyh/result.json`. La limpieza de ese
  intento está aprobada. Logs de los checks independientes y preflight en
  `.local-isolation/default-environment-2026-09-27/`. Lint: 245 archivos,
  cero errores y 233 warnings existentes, sin cambios ajenos.

**Cierre del bloqueo de validación, 2026-09-27:** la
[muestra de estabilidad del gate](../testing/FUNCTIONS_GATE_STABILITY.md)
completó tres ejecuciones independientes sin cambios de código entre ellas:
dos **1582/1582** y una detenida por timeout global de watch, sin assertions
funcionales fallidas. Inicialización JSDOM/OpenAI pasó después **2/2** aislada y
contratos/watch **29/29**, conservando todos los plazos. **Clasificación B** según
el criterio solicitado: flakiness documentada separadamente como deuda del
tooling, sin evidencia de regresión funcional. No se agregaron retries ni se
excluyeron suites; el intento fallido conserva exit 3.

El preflight de solo lectura del `2026-09-27T18:53:30.835Z` sigue aprobado:
107 ACTIVE, partición 101/3/3, sin drift nuevo; únicamente las seis eliminaciones
MP intencionales, ninguna adición ni cambio en valores/bindings preservados.
Readiness local aprobado. No se modificaron el watcher, JSDOM, los tests, los
timeouts, handlers o CI. No hubo deploy ni operaciones remotas de escritura.

**DEFAULT ENVIRONMENT READY FOR DEPLOY**

**Cierre de emails, 2026-09-18:** el operador confirmó el envío sandbox exitoso;
ver [el runbook de Fase 1](TRANSACTIONAL_EMAIL_SANDBOX_RUNBOOK.md). Esta validación
no cierra la migración/rotación de Mercado Pago ni el aislamiento del entorno.
Se conservan los cambios locales ya aprobados; no se rotaron credenciales ni se
desplegaron Functions de pagos durante el cierre.

**Cierre productivo de Payments, 2026-09-24:** el operador confirmó las tres
Functions en `payments`, default con 102 y total 105. El nuevo par Public Key +
Access Token v2 quedó validado con un pago real desde otra cuenta, dinero recibido,
webhook procesado y publicación automática. **Sigue pendiente rotar
`MP_WEBHOOK_SECRET` v1 por su exposición durante el diagnóstico anterior.**
Esta revisión de cierre no consulta servicios remotos, no despliega ni rota.
Ver [aceptación y rollback conservado](PAYMENTS_CODEBASE_PREPARATION.md).

## Hechos y causa

- El diagnóstico inicial tenía una sola codebase. Ahora `firebase.json` registra
  `default` / `functions` (101 exports), `payments` / `functions-payments` (3) y
  `email` / `functions-email` (3). El inventario remoto del 26/09 es 102/3/3:
  default contenía además `generatePublishedShareImage`, sin export local. El
  saneamiento del 27/09 lo retiró; los nombres remotos ya coinciden con el registro.
  El cierre posterior adoptó en source los límites actuales de 12 endpoints
  default y 2 Payments, retirando sus blockers sin cambiar producción; ver la
  decisión y validación en el informe de saneamiento enlazado arriba.
- La CLI instalada, Firebase CLI 14.4.0, lee `.env` y `.env.<project/alias>` del
  source y copia su mapa a **cada endpoint**. Ver `lib/functions/env.js:213` y
  `lib/deploy/functions/prepare.js:77-100` de la instalación de firebase-tools.
  El filtro `--only functions:email:testTransactionalEmail` limita endpoints a desplegar,
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
| `MERCADO_PAGO_PUBLIC_KEY` | A | Checkout, se devuelve al browser | `functions-payments/.env.reservaeldia-7a440`; nueva Public Key validada en producción con Access Token v2. |
| `MERCADO_PAGO_ACCESS_TOKEN` | C | Tres Functions de pagos | Secret Manager v2; bindings y pago productivo confirmados por el operador. No está en dotenv. |
| `MERCADO_PAGO_CLIENT_ID` | A | Sin consumidor en código mantenido | Retirada durante Etapa 2; no se copia a Payments. |
| `MERCADO_PAGO_CLIENT_SECRET` | C | Sin consumidor en el repositorio | Retirada de dotenv. Sin declaración ni binding; no crear un Secret para estas Functions. Rotación posterior pendiente, fuera de esta migración local. |
| `MERCADO_PAGO_WEBHOOK_URL` | B | Creación de preferencia/pago | `functions-payments/.env.reservaeldia-7a440`; URL conservada sin cambios. |
| `MP_WEBHOOK_SECRET` | C | `mercadoPagoWebhook` | Secret Manager v1; binding y webhook productivo confirmados. **Rotación pendiente por exposición previa.** No está en dotenv. |
| `GOOGLE_MAPS_EMBED_API_KEY` | A, identificador de API restringido | Render HTML y validación | `.env.reservaeldia-7a440`, `.env.production`; conservada sin cambios. Termina en iframe público; mantener restricciones de API/referrers. |
| `EMAIL_MODE` | B | Email | `functions-email/.env.reservaeldia-7a440`; retirada del dotenv default el 27/09, sin modificar Email. `defineString`, default bloqueado; sandbox en la revisión inicial. |
| `AWS_SES_ACCESS_KEY_ID` | C, parte del par de credenciales | testTransactionalEmail, testWelcomeEmail, onUserCreatedWelcomeEmail en email | `emails/config.ts`; bindings por endpoint, ver cierre sandbox del 26/09. |
| `AWS_SES_SECRET_ACCESS_KEY` | C | Los mismos tres endpoints de email | Igual que el anterior; nombres/metadatos, nunca valores. |
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

**Estado operativo al cierre (2026-09-24):** el traslado terminó y ya no aplica
el congelamiento específico de migración parcial. Conservar selectores completos
de Payments. Los procedimientos de rotación/rollback requieren una tarea separada;
no repetir los pasos históricos para cerrar este hito. Ver
[Payments: aceptación y rollback](PAYMENTS_CODEBASE_PREPARATION.md).

## Cambios locales y límite de aislamiento

**Etapa 2 local de Payments, 2026-09-22:** `firebase.json` registra el source
independiente Payments con tres endpoints; default conserva los otros 102.
La Public Key nueva y webhook URL se trasladaron sin alterar sus declaraciones;
Maps permanece en ambos sources por sus consumidores de render. Client ID no
tiene consumidores y se retiró. Se verificó únicamente metadata remota segura:
Access Token v2 en las tres Functions y webhook Secret v1. No hubo deploy,
lectura de valores de Secrets ni cambio remoto. Ver
[build, verificaciones y activación por etapas](PAYMENTS_CODEBASE_PREPARATION.md).

**Snapshot histórico del 24/09: la partición 102 + 3 fue validada por el operador;
Email todavía compartía default.** Ese límite fue reemplazado por la separación
validada hasta sandbox el 26/09, descrita abajo. La asignación vigente se gobierna
por [Functions ownership](../architecture/FUNCTIONS_CODEBASE_OWNERSHIP.md), no por
este snapshot. La preparación local de la migración
de `MERCADO_PAGO_ACCESS_TOKEN` y `MP_WEBHOOK_SECRET` quedó completada el
2026-09-19: bindings preparados y dotenv saneados. El operador confirmó la carga
manual de los Secrets; no se consultaron sus valores ni se verificó estado remoto.
El despliegue de pagos y la renovación del par Public Key + Access Token ya se
validaron. La rotación de la firma webhook expuesta sigue pendiente y separada.

Implementado localmente:

1. Declaraciones `defineSecret` en `payments/mercadoPagoClient.ts` para Access Token
   y firma webhook. Sus lecturas existentes de `process.env` siguen siendo lazy;
   Firebase también inyecta los secretos vinculados con esos mismos nombres.
   No cambian SDK, caché, timeouts, errores al cliente, firmas ni reglas de pagos.
2. Bindings mínimos en `payments/entrypoint.ts`: Access Token en checkout, creación de pago y
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
nombres. Ese estado local del 2026-09-19 fue seguido por el despliegue y la
validación productiva confirmados al cierre; no describe un deploy pendiente hoy.

**Separación de email implementada el 25/09 y validada remotamente el 26/09:**
`functions-email` / codebase `email` usa `lib/emails/entrypoint.js`, compilado desde
la lógica canónica `functions/src/emails`. El paquete autónomo contiene email y
sus dependencias compartidas necesarias. Dotenv local permite EMAIL_MODE=sandbox,
WELCOME_EMAIL_ACTIVATION_AT vacío y SUPERADMINS_UIDS de la autoridad canónica;
no contiene Maps, Payments, OpenAI ni valores de Secrets. Mantiene bindings AWS
por endpoint. Los dos smoke tests y el trigger Auth pertenecen remotamente a
email; Auth está ACTIVE y su prueba real produjo skipped/attempts=0 en sandbox.
La [migración y rollback aislado](TRANSACTIONAL_EMAIL_SANDBOX_RUNBOOK.md#migracion-email-codebase)
se conservan como referencia, sin repetir la migración.
Las variables gestionadas por la plataforma seguirán presentes.

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
de pago, consulta por ID y validación HMAC) → exports de `payments/entrypoint.ts`. Los demás
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

Procedimiento histórico completado para Payments según la aceptación del
2026-09-24. No repetir la carga, el traslado ni la renovación del Access Token
como parte del cierre. Se conserva como referencia operativa, sin valores.

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
   firebase deploy --only "functions:payments:createPublicationCheckoutSession,functions:payments:createPublicationPayment,functions:payments:mercadoPagoWebhook" --project reservaeldia-7a440
   ```

5. Verificar bindings/versiones e identidad con una proyección que no muestre envs:

   ```powershell
   gcloud functions describe mercadoPagoWebhook --gen2 --region=us-central1 --project=reservaeldia-7a440 --format="json(name,serviceConfig.serviceAccountEmail,serviceConfig.secretEnvironmentVariables.key,serviceConfig.secretEnvironmentVariables.version)"
   ```

   Repetir la proyección para los dos callables. Comprobar salud del checkout y
   notificaciones legítimas. Esta auditoría no realizó un cobro ni replay.

### Access Token y Client Secret expuestos

El operador ya renovó Public Key + Access Token y validó v2 en producción.
Los pasos 6-8 quedan como referencia para futuras rotaciones autorizadas, no
como trabajo pendiente de este hito. No se afirmó una renovación de Client Secret
sin consumidor; su revisión externa permanece fuera del cierre de Payments.

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

**Pendiente al 2026-09-24:** `MP_WEBHOOK_SECRET` v1 continúa en uso y debe
rotarse por exposición en el diagnóstico anterior. El pago real exitoso no
remedia esa exposición. No se rota en esta tarea de cierre.

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
    firebase deploy --only "functions:payments:mercadoPagoWebhook" --project reservaeldia-7a440
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
firebase deploy --only "functions:validateDraftForPublication,functions:prepareDraftPreviewRender,functions:preparePublicTemplatePreview,functions:adminGetTemplateEditorDocumentV1,functions:payments:createPublicationCheckoutSession,functions:payments:createPublicationPayment,functions:payments:mercadoPagoWebhook,functions:retryPaidPublicationWithNewSlug,functions:publicarInvitacion" --project reservaeldia-7a440
```

Después de sanear dotenv, actualizar solo la revisión de email (sin invocarla)
requiere el comando siguiente. Seguirá recibiendo variables **no secretas** ajenas
hasta la separación de source indicada arriba:

```powershell
firebase deploy --only functions:email:testTransactionalEmail --project reservaeldia-7a440
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

Los smoke tests conservan dos bindings AWS, IAM privado y su identidad dedicada.
El trigger Auth conserva otra identidad dedicada y los mismos bindings. La entrada
local de email declara solo estos tres endpoints, sin importar el entrypoint default.
`EMAIL_MODE` sigue parametrizado, disabled por defecto, sandbox permitido y
production implementado localmente, pendiente de activación y deploy explícitos.
La separación de ownership y los bindings remotos están
comprobados; no se certifican todos los valores del entorno ni IAM heredado,
porque deliberadamente no se consultaron entornos completos ni políticas de
proyecto/organización. La evidencia de evento comprueba el gate sandbox.

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
