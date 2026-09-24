# Emails transaccionales — Fase 1 validada en SES sandbox

Status: Operational Diagnostic Evidence. Cierre local: 2026-09-18.

## Validación real exitosa

**Resultado: EXITOSO.** El operador confirmó la recepción en Gmail del correo
“Prueba sandbox — Reserva el Día” y SPF, DKIM y DMARC en PASS.
Fecha de registro de la validación: **2026-09-18** (America/Buenos_Aires).
No se suministró un timestamp exacto del envío; no se conserva el correo ni sus
headers completos en el repositorio. Esta evidencia remota fue aportada por el
operador; el trabajo de cierre solo hizo cambios y verificaciones locales.

Recorrido validado:

```text
Reserva el Día
  → testTransactionalEmail (Firebase Functions v2, invocación privada IAM)
  → sendTransactionalEmail()
  → React Email (TestEmail → HTML + plain-text)
  → adaptador SES v2 / AWS SDK / IAM
  → Amazon SES sandbox
  → Gmail
```

| Configuración validada | Valor |
| --- | --- |
| Proyecto GCP | `reservaeldia-7a440` |
| Región de la Function | `us-central1` |
| Service account GCP | `email-sandbox-sender@reservaeldia-7a440.iam.gserviceaccount.com` |
| Región SES | `us-east-1` |
| Dominio SES | `reservaeldia.com.ar` |
| Remitente | `Reserva el Día <notificaciones@reservaeldia.com.ar>` |
| Custom MAIL FROM | `bounce.reservaeldia.com.ar` |
| DKIM / SPF / DMARC | PASS / PASS / PASS |
| Único destinatario sandbox | `reservaeldia.invitaciones@gmail.com` |
| `EMAIL_MODE` validado | `sandbox` |
| AWS Account ID | `993173880072` |
| Principal AWS comprobado con STS | `arn:aws:iam::993173880072:user/reservaeldia-ses-sender` |
| Secrets vinculados | `AWS_SES_ACCESS_KEY_ID`, `AWS_SES_SECRET_ACCESS_KEY` |

**SES continúa en sandbox.** La Fase 1 valida infraestructura; no conecta emails
de negocio ni reemplaza emails de Firebase Authentication.

## Componentes y límites vigentes

La única frontera de envío para consumidores es `sendTransactionalEmail()` en
`functions/src/emails/sendTransactionalEmail.ts`. `sesClient.ts` es el único
adaptador que importa `SESv2Client` y `SendEmailCommand`.

- `config.ts`: región, remitente, allowlist y parámetros nativos de Firebase.
  `EMAIL_MODE=disabled | sandbox | production`; ausente o vacío → `disabled`.
  `production` devuelve `EMAIL_PRODUCTION_NOT_ENABLED`: todavía no está habilitado.
- `awsCredentials.ts`: resuelve los dos Secrets de forma lazy y explícita, sin
  cadena implícita de credenciales AWS. Puede sustituirse en una fase futura sin
  cambiar el contrato del servicio. No resuelve Secrets durante discovery.
- `renderEmail.tsx` + `templates/TestEmail.tsx`: asunto fijo, datos sintéticos,
  HTML y plain-text generados con React Email. Sin assets externos ni tracking.
- `sesClient.ts`: remitente fijo con nombre Unicode codificado RFC 2047, un solo
  destinatario, contenido UTF-8, timeout total explícito de 8 s, conexión de 2 s
  y `maxAttempts: 1`. No hay reintentos automáticos ambiguos.
- `awsDiagnostics.ts`: conserva únicamente la normalización segura de errores
  que usa SES; no consulta STS. Nunca serializa errores SDK completos.
- `testEmailFunction.ts`: declara la Function y carga el servicio al invocarlo;
  no carga React Email/SES ni lee Secrets durante su declaración.

**`testTransactionalEmail` es una herramienta de smoke test de infraestructura,
no una API de negocio.** Mantiene `invoker: private`, service account dedicada,
solo los dos bindings AWS, CORS deshabilitado, `maxInstances: 1`, concurrencia 1,
memoria 256 MiB y timeout de Function de 20 s. Solo admite POST con cuerpo vacío
o `{}` y sin query. Fija destinatario, template `test` y datos sintéticos en el
servidor. No admite `to`, asunto, HTML, template arbitrario, CC, BCC ni headers.

El límite operativo es de tres intentos por instancia, separados al menos 60 s;
se reinicia con una instancia nueva y **no es una cuota distribuida**. IAM es la
frontera de acceso. El servicio rechaza destinatarios ajenos antes de renderizar;
el adaptador vuelve a comprobar la allowlist. No redirige mensajes bloqueados.

## Policy IAM validada

La policy definitiva informada por el operador y utilizada para el envío exitoso
es la siguiente. Este cierre la documenta; no modifica AWS ni permisos.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "ses:SendEmail",
      "Resource": "*",
      "Condition": {
        "StringLike": {
          "ses:FromAddress": "*@reservaeldia.com.ar"
        }
      }
    }
  ]
}
```

**Hallazgo observado:** limitar `Resource` exclusivamente a
`arn:aws:ses:us-east-1:993173880072:identity/reservaeldia.com.ar` falló en esta
prueba sandbox. AWS devolvió `AccessDeniedException` sobre
`arn:aws:ses:us-east-1:993173880072:identity/reservaeldia.invitaciones@gmail.com`:
también evaluaba la identidad verificada del destinatario.
La policy de dominio único queda descartada para esta configuración; **no volver
a introducirla**. La condición definitiva restringe el From al dominio y el
backend lo fija además a `notificaciones@reservaeldia.com.ar`, con la allowlist
exacta indicada arriba. No se añade `aws:RequestedRegion` a esta policy.

## Smoke test manual

Los pasos siguientes son para el operador cuando decida repetir la prueba.
Tests, build y deploy no envían correos automáticamente.

1. Confirmar `EMAIL_MODE=sandbox` en la configuración seleccionada para
   `reservaeldia-7a440`. En esta codebase se usa
   `functions/.env.reservaeldia-7a440`, ignorado por Git. No imprimir ni copiar el
   archivo completo. No cambiar credenciales ni secretos para repetir el smoke.
2. Confirmar que la Function conserva sus dos bindings y el acceso IAM privado.
   Usar una cuenta Google ya autorizada con `roles/run.invoker` sobre el servicio.
   No habilitar `allUsers`/`allAuthenticatedUsers` para resolver un 403.
3. Si se necesita publicar una revisión del smoke test, desde la raíz ejecutar
   manualmente solo el deploy dirigido:

   ```powershell
   firebase deploy --only functions:testTransactionalEmail --project reservaeldia-7a440
   ```

   El selector limita la Function desplegada; el build/discovery carga la
   codebase completa. No despliega pagos ni borra el diagnóstico remoto retirado
   del código. Revisar que el plan muestre únicamente el endpoint solicitado.
4. **Este paso sí envía un correo. Ejecutarlo una sola vez de forma intencional.**
   En PowerShell, capturar el token solo en memoria:

   ```powershell
   $emailTestUri = (gcloud functions describe testTransactionalEmail --gen2 --region=us-central1 --project=reservaeldia-7a440 --format="value(serviceConfig.uri)").Trim()
   $emailTestToken = (gcloud auth print-identity-token).Trim()
   try {
     Invoke-RestMethod -Uri $emailTestUri -Method Post -ContentType 'application/json' -Body '{}' -Headers @{ Authorization = "Bearer $emailTestToken" }
   } finally {
     Remove-Variable emailTestToken -ErrorAction SilentlyContinue
   }
   ```

   No usar transcripción, `--debug`, volcados de headers o comandos que muestren
   valores de Secret Manager. No imprimir el token ni el entorno de la revisión.

Resultado esperado HTTP 200:

```json
{
  "ok": true,
  "state": "accepted",
  "messageId": "<SES MessageId>",
  "errorCode": null,
  "retryable": false,
  "correlationId": "email-test-<uuid>"
}
```

**MessageId significa aceptado por SES, no entregado al destinatario.** Para
confirmar entrega, abrir Gmail en el buzón sandbox, comprobar asunto, remitente
y datos sintéticos. En **Mostrar original**, revisar SPF PASS con MAIL FROM
`bounce.reservaeldia.com.ar`, DKIM PASS con `d=reservaeldia.com.ar` y DMARC PASS
alineado con `reservaeldia.com.ar`. Revisar Spam si no aparece en Recibidos.

Logs `transactional_email`: template, modo, estado, duración, MessageId,
correlationId sintético y código normalizado. `transactional_email_aws_error`
solo permite nombre conocido, status HTTP, requestId UUID, principal/acción/recurso
validados y motivo IAM enumerado cuando AWS los proporciona. No registrar HTML,
plain-text, payload AWS, mensaje/stack completo de error, headers, tokens,
URLs sensibles, credenciales, valores de Secrets ni dumps de `process.env`.

HTTP 400/405: petición inválida; 403: acceso IAM; 412: envío bloqueado;
429: límite por instancia; 502: fallo SES normalizado; 504: resultado ambiguo.
Ante timeout/desconexión, comprobar Gmail y logs antes de otro intento manual.
No hay idempotencia entre invocaciones manuales distintas ni reenvío automático.

## Deshabilitar el sender

Cambiar únicamente la entrada local `EMAIL_MODE` a `disabled` y, cuando el
operador autorice aplicarlo, ejecutar:

```powershell
firebase deploy --only functions:testTransactionalEmail --project reservaeldia-7a440
```

El cambio de archivo local solo no cambia la revisión desplegada. Tras publicar
la revisión, nuevas invocaciones quedan bloqueadas; no revierte un envío en curso
o un mensaje ya aceptado. No establecer `production`: permanece bloqueado.

## Diagnóstico cerrado y limpieza

**Histórico:** `diagnoseEmailAwsIdentity` comprobó la identidad de la tabla mediante
STS y permitió diagnosticar el rechazo de IAM. Cumplió su propósito. Se eliminaron
su export, su handler HTTP, `awsIdentity.ts`, `awsIdentityFunction.ts` y la
dependencia directa `@aws-sdk/client-sts`. No forma parte de la operación normal.
Se conserva `awsCredentials.ts` por ser el proveedor lazy del sender, y la
sanitización de errores SES con sus pruebas permanentes.

**Retiro remoto pendiente:** eliminar fuentes no borra una Function desplegada.
Este cierre no consulta ni modifica GCP. Si la sonda sigue desplegada, el operador
puede retirarla específicamente después de verificar su nombre y región:

```powershell
firebase functions:delete diagnoseEmailAwsIdentity --region us-central1 --project reservaeldia-7a440
```

No borrar `testTransactionalEmail`, su service account ni sus Secrets compartidos.

**Histórico de discovery:** se conservó el import lazy del servicio desde la
Function. El entrypoint completo sigue siendo grande; no se aumentaron timeouts
ni se refactorizaron sus flujos. El test de discovery verifica que la declaración
no lea Secrets ni cargue el renderer/SES. No garantiza un tiempo máximo del
entrypoint completo bajo cualquier carga del sistema.

### Discovery compartido: revalidación local del 2026-09-19

Alcance: inicialización del entrypoint completo, sin deploy, invocaciones remotas,
lecturas de Secrets, dotenv ni credenciales reales. No se actualizaron Node ni
dependencias ni se modificaron opciones de Functions. Firebase CLI 14.4.0 descubre
los 105 endpoints antes de aplicar `--only`; cambiar ese selector no reduce la
carga del módulo. Se usó el servidor del SDK firebase-functions 6.4.0 y el mismo
`detectFromPort` de la CLI contra `/__/functions.yaml` en loopback, con su límite
original de 10.000 ms, sin `FUNCTIONS_DISCOVERY_TIMEOUT`.

Causa comprobada: `index` importa `publicationPayments`, que importa
`publicationPublishExecution` y `publishedShareImage`; este último cargaba JSDOM
estáticamente aun para declarar endpoints que no procesan HTML. El perfil
instrumentado dio 990–1001 ms para la rama de pagos y 767–774 ms para JSDOM
(tiempos inclusivos, no sumables). El antecedente informado por el operador era
2082/1392 ms respectivamente y 5–8 s para el entrypoint. En esta nueva serie no
se reprodujo un timeout; la variación de máquina/caché impide equiparar ambas
series como una comparación controlada.

Se difirió únicamente JSDOM a `createShareImageDom`, conservando las dos llamadas
reales, el constructor, los argumentos, la serialización y la API síncrona.
Node conserva el módulo cargado después del primer uso. En esta rama, el DOM
se necesita al preparar y diagnosticar el HTML para `share.jpg`, durante una
publicación efectiva desde `createPublicationPayment`, `mercadoPagoWebhook`,
`retryPaidPublicationWithNewSlug` o `publicarInvitacion`; no para crear la sesión
de checkout ni para consultar estado/servir metadata pública. Las otras rutas
de JSDOM (`verInvitacion`, `copiarPlantillaHTML`, validación countdown y procesadores
de iconos/decoraciones) ya estaban diferidas y no se modificaron. La regresión
cubre el grafo completo del entrypoint, incluidas esas rutas transitivas.

Después de ese cambio, tres discoveries dieron 1249/1292/1302 ms
(mínimo/mediana/máximo). El siguiente SDK evitable era OpenAI, 154–187 ms:
se convirtió su import en `import type` y se movió la carga a la fábrica
síncrona existente, después de sus validaciones. Conserva clase, key normalizada,
timeout de 25.000 ms y un reintento. No se modificaron interpretación ni requests.
Sharp (aprox. 33 ms) y Mercado Pago (aprox. 87 ms) quedaron intactos; no se
justificó ampliar el cambio. El costo dominante restante es Firebase/Express
necesario en la declaración/infraestructura actual, no React Email ni JSDOM.

Procesos nuevos secuenciales, Windows, Node 22.13.1 del PATH usado por la CLI;
sin limpiar caché del sistema operativo y sin instrumentación en estas muestras:

| Medición | Muestras | Mínimo | Mediana | Máximo |
| --- | ---: | ---: | ---: | ---: |
| `require('./functions/lib/index.js')`, antes | 7 | 1728 ms | 1743 ms | 2951 ms |
| Detector CLI, antes | 7 | 2251 ms | 2389 ms | 4163 ms |
| `require('./functions/lib/index.js')`, después | 9 | 808 ms | 826 ms | 843 ms |
| Detector CLI, después | 9 | 1153 ms | 1238 ms | 1606 ms |

Los nueve discoveries finales obtuvieron el backend specification: máximo
1,606 s, margen observado de 8,394 s frente a 10 s. Es evidencia local con
procesos nuevos, no una garantía temporal bajo cualquier carga. El primer uso
real de DOM/IA conserva el costo de cargar su biblioteca; no desaparece.

Evidencia local en `.local-isolation/discovery-20260919/` (ignorada por Git):
`probe.cjs` y `measure.cjs`, muestras/perfiles `before-*`, `jsdom-only-*`,
`after-*`, manifiestos completos y `comparison.json`. El entorno de los hijos
excluye credenciales y overrides de timeout; `networkGuard.cjs` bloquea red
externa. Los scripts sólo ejecutan carga, discovery local y fixtures sintéticas.
Desde la raíz, `node .local-isolation/discovery-20260919/measure.cjs recheck`
repite siete muestras de cada mecanismo y dos perfiles; usar una etiqueta nueva
para preservar la evidencia anterior.

Los 105 exports y el manifiesto completo antes/después son idénticos, tanto en
SDK como en el modelo obtenido por la CLI: endpoints, opciones, Secrets, params,
APIs y extensions. Se compararon todos los campos, sin una lista de exclusiones.
Cuatro entradas HTML y los bytes del JPEG sintético normalizado también fueron
idénticos; las suites cubren renderer, publicación y recuperación con dobles de
Storage/browser, sin capturas contra producción.

Verificación: 312/312 tests con el Node 20.19.5 ya disponible, incluidos
`publication*.test.mjs`, webhook, entrega pública, contratos de render,
configuración, email, IA y `discoveryInitialization.test.mjs`. Este último
demuestra ausencia de JSDOM/OpenAI al importar el entrypoint y carga por sus
funciones reales en runtime; la aserción de JSDOM falló antes del cambio.
Build, 48 copias compartidas, typecheck y lint de modificados aprobados.
Lint: cero errores, 23 warnings idénticos a HEAD (21 IA, 2 share image, cero en
el test nuevo). Evidencia: `tests-node20.tap`, `test-files.json`, `lint.json` y
`lint-baseline.json`; `git diff --check` aprobado. No se certifica un deploy
remoto ni se modifica la deuda de permisos/aislamiento descrita en otros documentos.

## Verificación local del cierre

Runtime de Functions: Node 20, como declara `functions/package.json`.
Desde `functions`, con ese runtime disponible:

```powershell
npm run build
npm run test:emails
node --require ../scripts/local/networkGuard.cjs --test runtimeConfiguration.test.mjs mercadoPagoWebhookEdge.test.mjs publicationPaymentEdge.test.mjs templateStorageAssets.test.mjs
npm run typecheck
```

Las suites de email usan transporte falso, datos sintéticos y trampas de red;
el cliente real está bloqueado en tests/emuladores. Los tests de configuración
verifican bindings, ausencia del export STS, discovery sin leer Secrets y logging
seguro. Se comprueban lint de archivos afectados y `git diff --check` desde la raíz.
Ninguno de estos checks invoca handlers remotos o hace deploy.

Resultados del cierre local (Node 20.19.5, 2026-09-18):

| Check | Resultado |
| --- | --- |
| Suite completa de emails | 39/39 aprobados; renderer, sandbox, transporte falso, sanitización y discovery lazy |
| Configuración | 6/6 aprobados; cero intentos de red y lecturas de Secrets en discovery |
| Pagos relacionados | 10/10 aprobados; webhook y contratos de pago sin cambios |
| Assets de plantillas relacionados | 1/1 aprobado con Storage falso |
| Typecheck / build Functions | Aprobados; 48 copias compartidas verificadas, sin cambios de contratos |
| Lint de archivos afectados | 0 errores; 28 warnings preexistentes en index, pagos y assets; ninguno en emails |
| `git diff --check` | Aprobado; solo avisos de conversión LF/CRLF de Git |

Revisión de secretos: se inspeccionaron 10.980 archivos de texto versionables
con patrones de credenciales y comparación en memoria contra valores sensibles
locales, sin imprimirlos. No se detectaron credenciales reales; la única
coincidencia fue una fixture sintética de `runtimeConfiguration.test.mjs`.
La documentación nueva no contiene credenciales reales. No se consultó Secret
Manager ni se inspeccionó el historial Git o recursos remotos en este cierre.

## Deudas separadas del cierre funcional

- Salida de SES sandbox y habilitación de `production`.
- Actualización posterior al cierre de emails, 2026-09-24: el operador confirmó
  la migración productiva de Payments, Secret Manager y el nuevo par Public Key +
  Access Token v2 mediante pago real, webhook y publicación automática.
  **Permanece pendiente rotar `MP_WEBHOOK_SECRET` v1 por exposición previa.**
  No se desplegó ni rotó Mercado Pago durante el cierre de emails.
  [Aceptación de Payments](PAYMENTS_CODEBASE_PREPARATION.md); procedimiento y consumidores en
  [BACKEND_CONFIGURATION_ISOLATION.md](BACKEND_CONFIGURATION_ISOLATION.md).
- **Payments ya tiene source/codebase independiente (3); default conserva 102,
  incluido email. La separación de email sigue pendiente.** Se conservan
  exclusiones `.env*`, `.secret*`, `.runtimeconfig.json` del paquete, bindings
  específicos y logging seguro. Excluir archivos no impide la inyección de dotenv
  a todas las Functions de un mismo source. El cierre de SES no certifica aislamiento completo.
- Node 22: runtime actual Node 20; el AWS SDK advierte/requerirá Node >=22 en
  versiones futuras. OpenAI 7.5.0 ya declara Node >=22 y genera una advertencia
  preexistente. No se actualizó Node ni OpenAI en esta fase.
- Eventos SES, delivery, bounce, complaint y suppression lists.
- Templates y emails reales de negocio, colas/idempotencia cuando corresponda.

Auth, pagos, publicación, proveedores, leads y analytics no se conectaron al
sender. No hay Firebase Auth propio, campañas de marketing ni nuevos flujos
productivos de negocio en esta fase. No se hizo commit durante el cierre.
