# Emails transaccionales — SES sandbox y templates React Email

Status: Operational Diagnostic Evidence. Fases 2A + 2B cerradas hasta sandbox: 2026-09-26.

**Revalidación del 27/09/2026:** la
[Etapa 2 de arquitectura](FUNCTIONS_STAGE2_RECONCILIATION.md) confirma los tres
endpoints ACTIVE en email, opciones/bindings/IAM esperados, EMAIL_MODE=sandbox,
activación vacía y autoridad superadmin coincidente. No faltaba repetir ningún
deploy/migración de infraestructura. El operador confirmó que SES sigue en
sandbox; no se habilitaron envíos ni se repitieron smokes. El remoto adicional
generatePublishedShareImage quedó clasificado B (reemplazado/obsoleto), retenido
hasta validar su recuperación segura antes del retiro. El cierre del 26/09 que
sigue se conserva como snapshot histórico, no como una nueva lista de operaciones.

La elección de codebase para nuevas Functions se rige por
[Functions ownership](../architecture/FUNCTIONS_CODEBASE_OWNERSHIP.md). Este runbook
conserva estado operativo y snapshots fechados; el cierre siguiente reemplaza la
preparación histórica y no autoriza repetir migraciones ni activar production.

<a id="cierre-welcome-sandbox"></a>
## Cierre formal de WelcomeEmail hasta sandbox — 26/09/2026

**Resultado: EXITOSO en sandbox. Production continúa bloqueado.** La Fase 2A
conserva el sistema visual React Email, WelcomeEmail, HTML/plain-text, preview,
From y Reply-To centralizados. La Fase 2B conserva la reserva atómica por UID y
el adaptador Auth v1 `onUserCreatedWelcomeEmail`, ahora desplegado en `email`.
No se modificó comportamiento para efectuar este cierre.

**Declaración del operador:** prueba real exitosa del trigger el 26/09/2026.
También había confirmado el envío manual de WelcomeEmail y las respuestas a
`hola@` mediante Cloudflare Email Routing. Esas pruebas previas no se repitieron.

**Hechos comprobados en este cierre**, mediante lecturas de control plane, logs
sanitizados y un único documento de delivery asociado a la correlación de prueba:

| Evidencia | Resultado |
| --- | --- |
| Trigger remoto | ACTIVE; Auth user.create, gen1 / Node 20 / us-central1; codebase email |
| Identidad | welcome-email-sender@reservaeldia-7a440.iam.gserviceaccount.com |
| Bindings | AWS_SES_ACCESS_KEY_ID versión 3; AWS_SES_SECRET_ACCESS_KEY versión 2; sin consultar valores |
| Inicio del delivery | 26/09/2026 23:11:06.553, America/Buenos_Aires; 27/09/2026 02:11:06.553Z |
| Log del procesador | 26/09/2026 23:11:09.862, America/Buenos_Aires; 27/09/2026 02:11:09.862396Z |
| sourceEventId | 1dab33d8-b7b5-4074-8246-d4199ab85ac7 |
| correlationId | welcome-2228fd59-b966-4e17-bae1-a07206926cae |
| Documento welcomeEmailDeliveries asociado | status=skipped; attempts=0; skipReason=EMAIL_SANDBOX_BUSINESS_BLOCKED |
| Log asociado | template=welcome; mode=sandbox; state=skipped; attempts=0; MessageId=null; errorCode=EMAIL_SANDBOX_BUSINESS_BLOCKED |

El log y el documento coinciden en sourceEventId/correlationId. El gate sandbox
del procesador retorna antes del sender; sus tests comprueban cero llamadas al
sender en ese recorrido. **Esta prueba valida Auth → procesador → Firestore y
el bloqueo de negocio en sandbox; no es un envío SES ni una prueba de entrega.**
La mera ausencia de logs SES no se usa como prueba. `accepted` sigue significando
aceptado por SES, nunca entregado al destinatario. Se mantiene **como máximo un
intento automático por UID**: cualquier estado existente impide otro intento;
no hay backfill, leases, colas ni reenvío automático al activar otro modo.

Baselines conservados:

- [Antes de la migración](baselines/email-remote-2026-09-25.json).
- [Smoke tests después de la migración](baselines/email-remote-2026-09-26.json):
  ambos pertenecen a email y conservan todas las opciones comparadas, URLs,
  privacidad, service account y versiones de Secrets.
- [Inventario completo, trigger, logs y delivery](baselines/welcome-sandbox-closure-2026-09-26.json):
  omite UID/email/nombre, cuerpos, tokens y valores secretos. No se consultaron
  variables de entorno completas. El modo sandbox está probado para el evento;
  la activación local permanece vacía. No se auditó eliminación de la cuenta Auth
  sintética ni se borró su delivery durante este cierre.

**Ownership comprobado, con una diferencia explícita fuera del alcance de email:**

| Codebase | Local | Remoto | Observación |
| --- | --- | --- | --- |
| default | 101 | 102 | Los 101 esperados están presentes; existe además generatePublishedShareImage sin export local |
| payments | 3 | 3 | Coincidencia exacta de nombres y ownership |
| email | 3 | 3 | testTransactionalEmail, testWelcomeEmail, onUserCreatedWelcomeEmail; todos en email |

No hay endpoints de email duplicados ni remanentes de email en default. El
inventario remoto contiene 108 recursos frente a 107 exports locales. Queda
**pendiente, en una tarea separada**, determinar consumidores y destino de
`generatePublishedShareImage` antes de un despliegue general de default. No se
añade un export ni se elimina ese recurso para forzar igualdad de inventarios.
La sonda histórica `diagnoseEmailAwsIdentity` no aparece en el inventario remoto.

Se conservan los tres endpoints de email, tests, preview, runbooks, baselines,
herramientas de comparación y rollback aislado. `testWelcomeEmail` sigue siendo
un smoke privado; su retiro debe ser un cambio explícito posterior. La limpieza
de este cierre se limita a helpers locales descartables, sin tocar recursos
remotos ni evidencia histórica útil. No se ejecutaron deploys, envíos, cambios
IAM/Secrets ni activación productiva durante este trabajo. El operador autorizó
un commit de cierre al finalizar; no se reescribe el historial anterior.

### Verificación del cierre y limpieza acotada

| Check del 26/09 | Resultado |
| --- | --- |
| Email / Welcome / procesador / adaptador | 152/152 |
| Paquete email / Payments / configuración | 9/9, 10/10, 8/8 |
| Inicialización/discovery unitario | 2/2 al repetir sin carga concurrente; el primer intento de JSDOM/default excedió 30 s |
| Entorno local | 12/12 |
| Rules + Auth/Functions/Firestore emulados + countdown | 1408/1408; launcher exit 0, cleanup y puertos libres |
| Build y typecheck | default, payments y email aprobados; preview build aprobado; Node 20.19.5 |
| Lint de 50 archivos relevantes | Sin diagnósticos nuevos; 18 warnings de index y no-unsafe-finally en rules.test.mjs:241, reproducido contra HEAD |
| Integridad | 151 archivos de runtime, configuración, Rules y locks sin cambios respecto del inicio |
| Credenciales | 11.035 archivos de texto presentes y versionables revisados; sin coincidencias de credenciales en la revisión final; sin valores secretos en los nuevos baselines |
| Diff | git diff --check aprobado |

El lint global no se declara aprobado mientras exista la deuda indicada. La
primera ejecución conjunta tuvo 180/181 tests aprobados; se conservan ese log y
la repetición 2/2 de discovery, sin ocultar el timeout ni ampliar sus límites.
La búsqueda de credenciales cubre el estado actual de archivos, no una auditoría
completa del historial Git. Los runtimeconfig ya versionados contienen únicamente
la autoridad superadmin; el ejemplo de Secret no contiene una clave OpenAI válida.
No se imprimieron esos valores ni se consultó Secret Manager.

Se retiraron cuatro helpers descartables: `compare.cjs` y `lint.cjs` de
`.local-isolation/welcome-2b2/`, sustituidos por verificadores mantenidos, y los
dos scripts de consulta puntual de este cierre. Permanecen sus resultados,
baselines, pruebas, preview y rollback. No se borraron otros tmp ajenos.

Durante la sesión apareció el commit del operador `af645d50` (`sistema de mails`),
que incorporó la instalación temporal de `scripts/local/tools/node_modules`.
El cierre excluye esa carpeta generada del seguimiento mediante `.gitignore`;
conserva `scripts/local/tools/package.json`, su lockfile y la caché de herramientas.
No se reescribe ese commit ni se actualizan dependencias. La instalación se
reproduce con el procedimiento local existente. Esta carpeta explica el volumen
de eliminaciones del commit de cierre; no es código de la aplicación eliminado.

Evidencia completa: `.local-isolation/welcome-close-2026-09-26/` y
`.local-isolation/reports/run-A4hSMT/`. Los baselines remotos sanitizados enlazados
arriba se conservan en Git. Sigue pendiente, fuera de este cierre, revisar el
endpoint adicional de default y autorizar cualquier habilitación productiva.

## Validación real exitosa

La autoridad local y remota de email es el source/codebase `email`. La
[migración secuencial](#migracion-email-codebase) queda como referencia histórica;
no repetirla como prerrequisito. Para futuros cambios usar selectores completos
por endpoint y verificar metadata. La evidencia que sigue corresponde a Fase 1.

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

- `config.ts`: región, remitente, Reply-To, allowlist y parámetros nativos de Firebase.
  `EMAIL_MODE=disabled | sandbox | production`; ausente o vacío → `disabled`.
  `production` devuelve `EMAIL_PRODUCTION_NOT_ENABLED`: todavía no está habilitado.
- `awsCredentials.ts`: resuelve los dos Secrets de forma lazy y explícita, sin
  cadena implícita de credenciales AWS. Puede sustituirse en una fase futura sin
  cambiar el contrato del servicio. No resuelve Secrets durante discovery.
- `renderEmail.tsx` + `templateRegistry.tsx`: registro tipado `test | welcome`,
  validación de datos y generación HTML/plain-text con React Email. El renderer
  no importa configuración Firebase, transporte ni Secrets.
- `sesClient.ts`: remitente y Reply-To fijos con nombres Unicode codificados RFC 2047, un solo
  destinatario, contenido UTF-8, timeout total explícito de 8 s, conexión de 2 s
  y `maxAttempts: 1`. No hay reintentos automáticos ambiguos.
- `awsDiagnostics.ts`: conserva únicamente la normalización segura de errores
  que usa SES; no consulta STS. Nunca serializa errores SDK completos.
- `testEmailFunction.ts`: declara la Function y carga el servicio al invocarlo;
  no carga React Email/SES ni lee Secrets durante su declaración.
- `welcomeEmailTestFunction.ts`: smoke privado temporal `testWelcomeEmail`,
  validado y migrado a email con datos fijos. Tiene un gate explícito `sandbox`
  y usa el mismo servicio mediante import lazy. El alta de usuarios utiliza
  otro adaptador: `welcomeRegistrationFunction.ts`.

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

### Reply-To centralizado

Definición server-side en `config.ts`: `EMAIL_REPLY_TO_NAME = "Agus de Reserva el Día"`
y `EMAIL_REPLY_TO_ADDRESS = "hola@reservaeldia.com.ar"`. El From conserva
`Reserva el Día <notificaciones@reservaeldia.com.ar>`.
`sesClient.ts` agrega el buzón `Agus de Reserva el Día <hola@reservaeldia.com.ar>`
a `SendEmailCommand.ReplyToAddresses`, codificando solo el nombre con MIME
encoded-word UTF-8/Base64 para preservar el acento. Sigue usando `Content.Simple`,
sin headers personalizados ni `SendRawEmail`.
[Contrato SES v2](https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_SendEmail.html#SES-SendEmail-request-ReplyToAddresses)
y [codificación de nombres](https://docs.aws.amazon.com/ses/latest/dg/send-email-raw.html#send-email-mime-encoding).

Los callers no pueden proporcionar From, Reply-To ni headers: el servicio
rechaza campos adicionales en el envelope, metadata y datos del template.
El adaptador construye explícitamente el comando y no propaga campos extra del
request o renderer. HTML/plain-text no contienen ni necesitan esta configuración.
TestEmail, WelcomeEmail y futuros templates heredan el mismo Reply-To al usar
`sendTransactionalEmail()` con esta versión desplegada.

Este cambio es local: desplegar solo `testWelcomeEmail` no actualiza la revisión
remota de `testTransactionalEmail`. Cada Function heredará el cambio cuando se
despliegue con este source. No cambia dominio, DNS, Secrets, modo ni destinatario
sandbox. No se envió un correo para validar el header remoto; el operador puede
comprobar en Mostrar original `Reply-To: Agus de Reserva el Día <hola@reservaeldia.com.ar>`
(nombre posiblemente codificado) y que Responder prepare `hola@reservaeldia.com.ar`
tras el smoke manual autorizado.

## Templates y sistema visual — Fase 2A

El template define presentación, datos, asunto y preheader. El transporte define
remitente, Reply-To, destinatario permitido, credenciales y entrega a SES. Registrar una
plantilla no crea un evento ni una Function: `sendTransactionalEmail()` sigue
siendo la única frontera de envío. Ahora valida ambos templates con el mismo
registro, conserva los modos/allowlist y registra el nombre del template sin
nombre personal, URL ni contenido. El correlationId permite exclusivamente UUID v4
con prefijos `email-test-` (smoke) o `welcome-` (procesador backend).
`testTransactionalEmail` sigue construyendo exclusivamente `test` con `{}`.

```text
functions/src/emails/
  types.ts                     EmailTemplateData, unión discriminada y envelope
  templateData.ts               Validación pura, compartida con config.ts
  templateRegistry.tsx          Componentes, subjects, validadores y fixtures
  renderEmail.tsx               Dispatch exhaustivo → HTML + plain-text
  theme.ts                     Valores exclusivos de email y marca
  content/welcome.ts           Copy, subject, preheader y saludo
  components/
    EmailLayout.tsx            Idioma, preheader, ancho, fondo y estructura
    EmailHeader.tsx            Marca en texto temporal
    EmailFooter.tsx            Marca, lema, sitio, redes y slot legal opcional
    EmailButton.tsx            Enlace CTA con Button de React Email
    EmailCard.tsx              Superficie blanca y acento de marca
  templates/
    TestEmail.tsx              Smoke técnico existente, sin rediseño
    WelcomeEmail.tsx           Primera plantilla de producto
```

`EmailTemplateRequest` se deriva de un mapa de datos por template y luego se
indexa como unión. No usar `Pick` sobre `TransactionalEmailRequest` para reconstruir
el par: perdería la relación entre discriminante y datos. `renderEmail()` recibe
esa unión y también valida en runtime. Los campos adicionales de datos se rechazan.

WelcomeEmail recibe `{ name?: string; dashboardUrl: string }`. Sin nombre, vacío
o solo espacios, saluda `¡Hola!`; con nombre, `¡Hola, María!`. React escapa el nombre
como texto. `dashboardUrl` es obligatoria: URL absoluta HTTPS cuyo origen es
`https://reservaeldia.com.ar`, sin credenciales, espacios o barras invertidas.
La ruta/query pueden variar; el origen se restringe para evitar CTAs locales,
inseguros o ajenos a la plataforma. No se comprueba una sesión ni se consulta la
URL al renderizar. Si cambia el dominio canónico, actualizar `emailBrand`, el
validador y sus pruebas como un cambio deliberado.

- **Subject:** `Bienvenido a Reserva el Día`.
- **Preheader:** `Tu invitación empieza acá. Elegí una plantilla y hacela tuya.`
- **CTA:** `Crear mi invitación`.
- Copy centralizado en `content/welcome.ts`: carta personal de Agus, fundador.
  Mantiene los párrafos en una sola superficie, las dos frases solicitadas en
  negrita y el CTA inmediatamente después del párrafo de personalización.
  La firma usa dos líneas, también en plain-text.

Los componentes usan tablas de presentación y estilos inline, Arial/Helvetica,
ancho de 600 px limitado al espacio disponible, cuerpo de 16 px e idioma español.
El color principal `#692B9A` sigue [Design System](../design/DESIGN_SYSTEM.md),
sin importar CSS/Tailwind, fuentes remotas, gradientes, flex/grid ni JavaScript.
El CTA tiene contraste calculado blanco/violeta de 8,70:1 y usa los ajustes MSO
del `Button` instalado. El footer conserva el sitio y muestra el lema
«Invitaciones digitales para momentos que importan.». Acepta
`socialLinks?: readonly { label: string; href: string }[]`, con Instagram y
LinkedIn de Reserva el Día como valores por defecto; `[]` oculta las redes.
Usa enlaces de texto y estilos inline, sin imágenes o JavaScript. El plain-text
conserva sus URLs completas. Permite contenido adicional explícito del template
y no agrega unsubscribe por defecto.

No se crean `MetricCard` ni `StatsRow`: futuras plantillas pueden componerlos en
`components/` usando `theme.ts` y las primitivas de tablas de React Email cuando
exista una necesidad concreta. No requieren otro renderer ni otro transporte.

### Identidad y compatibilidad

Se inspeccionaron los assets existentes: `public/assets/img/logo.png` es un
wordmark violeta horizontal y el candidato adecuado para email sobre blanco;
`logo-full.png` es una composición cuadrada con símbolo (el sitio lo referencia
en metadata pública); `logo_reservaeldia.png` tiene letras blancas transparentes
y no sirve sobre el fondo claro actual. SVG no es necesario para este email.

No se pudo comprobar desde este entorno el acceso HTTP público de los PNG.
**Solución temporal:** `EmailHeader` muestra «Reserva el Día» como texto legible,
sin ruta local, imagen autenticada ni dependencia de descargas. Para sustituirlo,
verificar una URL HTTPS pública estable del wordmark, MIME/dimensiones, retención
del asset y render con imágenes bloqueadas; usar `Img` con ancho/alto y alt.
No se subió ni publicó ningún asset durante esta fase.

El preview de navegador permite revisar composición y responsive, pero no
certifica Gmail, Outlook de escritorio ni Apple Mail. Pendiente una matriz real
de clientes antes de conectar producción, incluidos modo oscuro, zoom y bloqueo
de imágenes. Outlook clásico puede ignorar el máximo fluido y mantener 600 px
en paneles estrechos; la presentación no depende de esquinas redondeadas ni
efectos modernos. Los cambios de color forzados por dark mode no están certificados.

### Preview local sin envío

Desde la raíz:

```powershell
npm run email:dev
```

En PowerShell con scripts `.ps1` restringidos usar `npm.cmd run email:dev`.
URL: **http://127.0.0.1:3001**. La lista muestra `test` y `welcome` con asunto,
enlaces HTML y texto plano; bienvenida directa: **http://127.0.0.1:3001/welcome.html**.
Los datos sintéticos están en `WelcomeEmail.PreviewProps` y el registro. Editar
`src/emails/templates/`, `components/` o `content/`, guardar, esperar
«Emails renderizados» en la terminal y recargar el navegador. Ctrl+C detiene
watcher y servidor. Si hay errores TypeScript/render, el preview responde 503
en lugar de mostrar una versión anterior; el puerto ocupado produce un error.

La CLI de `react-email@6.9.3` está instalada, pero `email dev/build` requiere
`@react-email/ui` de la misma versión, ausente del proyecto. Se eligió un adapter
local pequeño (`scripts/emailPreview.cjs`) que usa TypeScript instalado y el
mismo `renderEmail()`/React Email: no agrega paquetes, transporte ni una copia
del template. No ejecuta el dev del sitio ni emuladores. Escucha solo loopback,
no carga dotenv, no lee Secrets, no tiene endpoint de envío y precarga el guard
de red existente. No es el servidor de preview nativo de React Email.

Para compilar y generar archivos sin dejar un servidor activo:

```powershell
npm run email:build
```

Equivalentes desde `functions`: `npm run email:dev` y `npm run email:build`.
Generados: `functions/.email-preview/lib/` y `.email-preview/rendered/`
(`welcome.html`, `welcome.txt`, `test.html`, `test.txt`, índice).
Son fixtures locales, ignoradas por Git, lint y el paquete Firebase default.
`tsconfig.emails.json` compila solo el renderer y su grafo puro. Ninguno de estos
comandos requiere SES o una cuenta externa; no ejecutar el smoke manual para
previsualizar. Las URLs dentro del mensaje son públicas; solo el servidor de
preview usa una dirección local.

### Agregar un template

1. Definir sus datos en `EmailTemplateData` de `types.ts`; la unión de requests
   se actualiza desde ese mapa.
2. Crear el componente en `templates/` con props tipadas, export default y
   `PreviewProps` sintéticas; componer `EmailLayout` y los componentes útiles.
   Mantener copy/subject/preheader juntos fuera de la carpeta de templates.
3. Agregar su validador puro en `templateData.ts` y su definición en
   `emailTemplates` (componente, asunto, validador y datos de preview).
4. Extender los switches de validación y render. El despacho exhaustivo debe
   volver a compilar. El preview enumera el registro automáticamente.
5. Agregar casos HTML/texto, seguridad, campos opcionales, caracteres y tipos;
   verificar ancho móvil y límites de clientes. Compilar antes de tests sobre `lib`.
6. Integrar un consumidor de `sendTransactionalEmail()` solo en la fase que
   autorice el evento, destinatario, datos y política de duplicados/errores.

### Verificación de Fase 2A

Desde `functions`, Node 20 como el source desplegable:

```powershell
npm run build
npm run test:emails
npm run typecheck
npm run email:build
node node_modules/eslint/bin/eslint.js src/emails scripts/emailPreview.cjs scripts/lintScope.cjs welcomeEmail.test.mjs testUtils/emailTemplateTypes.ts .eslintrc.js --ext .ts,.tsx,.cjs,.mjs --max-warnings 0
```

Desde la raíz: `git diff --check`. `welcomeEmail.test.mjs` añade cobertura de
HTML, plain-text, asunto/preheader, nombres, Unicode, CTA, inyección, URLs,
registro, render sin infraestructura y servicio con transporte falso. Compila
`testUtils/emailTemplateTypes.ts` con `noEmit` y casos `@ts-expect-error`, fuera
del source de producción. Los tests previos del smoke y SES se conservan.

Evidencia visual local del 2026-09-25 en
`.local-isolation/email-phase2a/` (ignorada por Git): capturas desktop 1000 px,
móvil 375 px, estrecho 320 px, sin nombre y nombre largo; `screens.cjs` reproduce
la revisión con Chrome headless y `puppeteer-core` ya instalado, permitiendo solo
requests al preview loopback. `visual-results.json` registra ausencia de scroll
horizontal en esos casos y CTA de 47,2 px. La primera variante con ancho fijo
ensanchaba la tabla móvil: se corrigió fijando el layout de la tabla exterior,
manteniendo el máximo fluido interior. Estas capturas no sustituyen pruebas en
los clientes de correo indicados arriba.

Resultados finales del 2026-09-25, Node 20.19.5: **50/50 tests de email** y
**8/8 tests de configuración/tooling** (`runtimeConfiguration.test.mjs` y
`scripts/lint.test.cjs`), typecheck, build Functions con 48 copias compartidas
idénticas, `email:build`, lint de modificados (0 errores/0 warnings) y
`git diff --check` aprobados. Logs sintéticos: `tests.tap` y `tooling-tests.tap`
en la misma carpeta local de evidencia. El SDK AWS conserva su aviso sobre
soporte futuro de Node >=22; no se cambió runtime ni dependencias. Sin envíos,
deploy ni commit. No se ejecutó el build nativo de la UI React Email ausente;
se verificó el comando de preview/build local documentado.

### Pendiente para conectar bienvenida al registro real

Definir el evento autoritativo de alta y su elegibilidad (incluidos proveedores
de acceso y estado de verificación), destinatario y nombre de fuente confiable,
URL del panel, idempotencia y tratamiento de errores sin bloquear el alta.
Evolucionar la correlación sintética con logging sin PII, verificar clientes
reales y aprobar la integración/pruebas de ese flujo. Habilitar destinatarios
reales requiere una fase explícita de salida de sandbox/producción. No se han
modificado Authentication, verificación de email, password reset, colas, tracking,
políticas SES ni handlers de registro en Fase 2A.

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

## Smoke temporal de WelcomeEmail — validado y migrado a email

Implementación local del 2026-09-25: `testWelcomeEmail`, exportada por
`functions/src/emails/entrypoint.ts`, en el source/codebase local `email`. Reutiliza
`sendTransactionalEmail()` → `renderEmail()` → `WelcomeEmail` → SES v2.
`testTransactionalEmail`, TestEmail, configuración SES y dotenv se conservan.

- IAM privado, `us-central1`, misma service account
  `email-sandbox-sender@reservaeldia-7a440.iam.gserviceaccount.com` y los mismos
  Secrets `AWS_SES_ACCESS_KEY_ID` / `AWS_SES_SECRET_ACCESS_KEY`.
- `EMAIL_MODE` debe ser exactamente `sandbox`. Otros valores devuelven HTTP 412
  / `WELCOME_TEST_SANDBOX_REQUIRED` antes de cargar el sender. No se modifica
  el modo ni se habilita `production`.
- Solo POST con cuerpo vacío o `{}`, sin query params. No permite destinatario,
  template, asunto, HTML, nombre, URL ni datos suministrados por el invocador.
- Payload fijado en servidor: `to: reservaeldia.invitaciones@gmail.com`,
  `template: welcome`, `name: Agustín`,
  `dashboardUrl: https://reservaeldia.com.ar/dashboard`.
- Máximo 3 intentos por instancia con 60 s entre intentos, incluidos fallos de
  envío. `maxInstances: 1`, concurrencia 1, timeout 20 s, memoria 256 MiB.
  El límite se reinicia en cold start/redeploy; no es una cuota distribuida.
  No hay retry automático. Los inputs o modos rechazados no consumen intentos.

Los siguientes comandos son para ejecución manual posterior del operador.
**Ninguno se ejecutó durante esta preparación.** No repetir el smoke técnico
para validar WelcomeEmail ni habilitar acceso público.

### Desplegar únicamente el smoke de bienvenida

Desde `C:\Reservaeldia`, PowerShell:

```powershell
firebase.cmd deploy --only functions:email:testWelcomeEmail --project reservaeldia-7a440
```

El selector incluye codebase y nombre de Function; se comprobó contra el parser
de Firebase CLI 14.4.0 instalado. Compila/discover el source, pero el único
endpoint seleccionado es `testWelcomeEmail`. Conservar `EMAIL_MODE=sandbox` y
los bindings existentes; no usar `--only functions`.

### Otorgar acceso de invocación a la cuenta personal

Después del deploy, con la cuenta Google personal deseada activa en gcloud y
permisos para editar IAM del servicio:

```powershell
$welcomeInvoker = (gcloud.cmd config get-value account).Trim()
if ($LASTEXITCODE -ne 0 -or $welcomeInvoker -notmatch '@' -or $welcomeInvoker -like '*.gserviceaccount.com') {
  throw 'Seleccioná tu cuenta Google personal en gcloud antes de asignar el permiso.'
}
gcloud.cmd functions add-invoker-policy-binding testWelcomeEmail --region=us-central1 --project=reservaeldia-7a440 --member="user:$welcomeInvoker"
```

En Functions v2 este comando concede **`roles/run.invoker` sobre el servicio
Cloud Run subyacente**, sin asignar el rol al proyecto completo ni a `allUsers`.
Referencia: [gcloud add-invoker-policy-binding](https://docs.cloud.google.com/sdk/gcloud/reference/functions/add-invoker-policy-binding).
Si quien administra IAM es otra persona, debe usar tu email explícito en
`--member="user:TU_EMAIL"` en lugar de su propia cuenta activa.

### Invocar una vez de forma manual

**Este comando sí enviará un correo** si pasa IAM y las validaciones sandbox.
Usar la cuenta a la que se otorgó invoker. El token permanece solo en memoria:

```powershell
$welcomeUri = (gcloud.cmd functions describe testWelcomeEmail --gen2 --region=us-central1 --project=reservaeldia-7a440 --format="value(serviceConfig.uri)").Trim()
if ($LASTEXITCODE -ne 0 -or $welcomeUri -notmatch '^https://') { throw 'No se pudo obtener la URL HTTPS de testWelcomeEmail.' }
try {
  $welcomeToken = (gcloud.cmd auth print-identity-token).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $welcomeToken) { throw 'No se pudo obtener el ID token.' }
  Invoke-RestMethod -Uri $welcomeUri -Method Post -ContentType 'application/json' -Body '{}' -Headers @{ Authorization = "Bearer $welcomeToken" }
} finally {
  Remove-Variable welcomeToken -ErrorAction SilentlyContinue
}
```

No imprimir el token ni ejecutar con transcripción, debug o volcado de headers.
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

Esto significa aceptación por SES, no entrega confirmada. En el Gmail sandbox
debería aparecer el asunto **Bienvenido a Reserva el Día**, saludo **¡Hola,
Agustín!** y CTA **Crear mi invitación** a la URL canónica del panel. Comprobar
preheader, disposición móvil, texto y SPF/DKIM/DMARC en Mostrar original, como
en el smoke de infraestructura. No registrar el correo/headers completos ni PII.

HTTP 400/405 indica input/método inválido; 403, IAM; 412, modo o envío bloqueado;
429, límite por instancia; 502, fallo SES; 504, resultado ambiguo. Ante un 504,
comprobar recepción/logs antes de considerar otro intento manual.

Tests offline: `welcomeEmailSmoke.test.mjs` cubre IAM/runtime, payload fijo,
rechazo de inputs, modos, límites, errores, discovery lazy, bloqueo del launcher
local y el recorrido real de render/servicio/comando SES con cliente falso.
Se incluye en `npm --prefix functions run test:emails`. Los tests de inventario
ahora esperan **103 endpoints locales default + 3 Payments** y siguen comparando
todos los hashes/opciones de los 105 endpoints originales con su baseline.
Esto describe el source local; no afirma cambios en el inventario remoto.

Verificación de esta preparación (Node 20.19.5, 2026-09-25): **59/59 tests de
email**, **19/19 regresiones** (`runtimeConfiguration`, `paymentsPackage` y
`discoveryInitialization`), build con 48 copias compartidas sin diferencias,
typecheck y `git diff --check` aprobados. Lint completo: 227 archivos, 0 errores
y 233 warnings existentes; handler/test nuevos sin warnings, los 18 de `index.ts`
comparados con HEAD sin cambios salvo desplazamiento de línea por el export.
Evidencia local ignorada por Git: `.local-isolation/welcome-smoke/` (`emails.tap`,
`regression.tap`, `lint.json`, `lint-comparison.json`). Se compararon hashes para
confirmar que el smoke técnico, SES y el dotenv existente permanecieron intactos,
sin imprimir contenido sensible. El selector exacto de deploy se verificó con
el parser instalado sin ejecutar Firebase CLI ni consultar servicios remotos.

**Retiro futuro, requiere autorización separada:** este cierre conserva
`testWelcomeEmail` y todas sus pruebas para no cambiar comportamiento. Al
autorizar su retiro, quitar únicamente su export/handler y sus pruebas específicas; actualizar el
inventario y registrar el resultado aquí. El retiro de cualquier despliegue
remoto requiere una operación dirigida y autorizada por separado. Conservar
`testTransactionalEmail`, WelcomeEmail, el sender, service account y Secrets.

## Smoke test manual

Los pasos siguientes son para el operador cuando decida repetir la prueba de
infraestructura con TestEmail.
Tests, build y deploy no envían correos automáticamente.

1. Confirmar `EMAIL_MODE=sandbox` en la configuración seleccionada para
   `reservaeldia-7a440`. En esta codebase se usa
   `functions-email/.env.reservaeldia-7a440`, ignorado por Git. No imprimir ni copiar el
   archivo completo. No cambiar credenciales ni secretos para repetir el smoke.
2. Confirmar que la Function conserva sus dos bindings y el acceso IAM privado.
   Usar una cuenta Google ya autorizada con `roles/run.invoker` sobre el servicio.
   No habilitar `allUsers`/`allAuthenticatedUsers` para resolver un 403.
3. Si se necesita publicar una revisión del smoke test, desde la raíz ejecutar
   manualmente solo el deploy dirigido:

   ```powershell
   firebase deploy --only functions:email:testTransactionalEmail --project reservaeldia-7a440
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
firebase deploy --only functions:email:testTransactionalEmail --project reservaeldia-7a440
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

**Actualización del 26/09/2026:** la sonda no aparece en el inventario remoto
consultado para el cierre. No hay retiro pendiente comprobado. Se conserva este
comando histórico solo para referencia; no ejecutarlo como parte del cierre:

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

<a id="welcome-registration-2b1"></a>

## Procesador de altas — garantía de Fase 2B.1

`welcomeRegistration.ts` recibe una representación confiable de Firebase Auth
desde backend: `user: { uid, email?, displayName?, disabled?, customClaims?,
creationTime? }` y `sourceEventId`. No es un endpoint ni acepta datos de un
formulario del navegador. Fase 2B.2 agrega el adaptador descrito abajo; la
preparación local del 25/09 no hizo deploy y la validación remota consta en el cierre del 26/09.
**No se afirma que usuarios reales reciban WelcomeEmail automáticamente.**

```text
processWelcomeRegistration(registration)
  → resolver modo y elegibilidad
  → welcomeDeliveryStore.reserve(uid): Firestore DocumentReference.create()
  → solo si obtuvo reserva dispatching: sendTransactionalEmail(template: "welcome")
  → persistir el resultado; como máximo dos escrituras del mismo resultado
```

La reserva usa la precondición atómica `exists=false`. No necesita una lectura
previa ni transacción; SES nunca corre dentro de una transacción Firestore.
Solo quien recibe confirmación de creación puede llamar al sender. Un error al
reservar, incluso si el servidor pudo haber creado el documento, no concede ese
derecho. Otro intento puede reservar únicamente si el documento sigue ausente.

**Garantía: at most one automatic attempt por UID**, mientras se conserve su
registro. Cualquier estado existente, incluso `skipped`, impide otro intento.
No hay leases, expiración, TTL, eliminación ni recuperación automática de
reservas antiguas. Cambiar el modo o volver a iniciar sesión no reprocesa UIDs.
Se prioriza evitar duplicados: una caída después de reservar puede perder la
bienvenida. Esto no promete exactly-once ni entrega al destinatario.

### Colección privada y estados

`welcomeEmailDeliveries/{uid}` es exclusivamente backend/Admin SDK, con UID
válido como único segmento del documento. No guarda email, nombre ni contenido.
Rules niega lectura/escritura a todos los clientes, incluidos el propio UID y
claims administrativos, y excluye este árbol del fallback genérico. Admin SDK
opera con su identidad IAM y omite Rules; no hay endpoint que exponga el store.

Campos comunes: `status`, `sourceEventId`, `correlationId`, `attempts`,
`startedAt`, `updatedAt`. Las fechas son `Date` del backend, persistidas como
Firestore Timestamp. `startedAt` es la fecha de reserva, también para un skip.
Campos opcionales según resultado: `acceptedAt`, `messageId`, `errorCode`,
`skipReason`. `creationTime` no se persiste; desde 2B.2 participa en el gate de
activación productiva, que permanece sin fecha configurada.

| Estado | Significado | Campos adicionales |
| --- | --- | --- |
| `dispatching` | Derecho reservado; no confirma que haya salido una petición SES | Ninguno |
| `accepted` | SES devolvió MessageId; **no significa delivered** | `acceptedAt`, `messageId` |
| `failed` | Rechazo explícito conocido de SES, según el resultado normalizado del sender | `errorCode` |
| `unknown` | Timeout, conexión interrumpida, respuesta sin MessageId o excepción ambigua | `errorCode` |
| `skipped` | Envío omitido por modo/elegibilidad o bloqueo conocido anterior a SES | `skipReason` |

`attempts` vale 0 si se omite antes del sender, y 1 al reservar `dispatching`.
Cuenta intentos automáticos reservados del procesador, no peticiones SES ni
entregas: si el sender bloquea production o falla el render, permanece 1 aunque
no se haya llamado a SES. Un duplicado registra 0 intentos **adicionales** en
logs; no modifica el contador ni la correlación del documento existente.

### Elegibilidad, datos y modos

- UID y sourceEventId inválidos fallan antes de acceder al store o al sender.
- `disabled === true`, claim `admin === true` o superadmin conocido por
  `auth/adminAuth.isSuperAdmin(uid)` se omiten. La autoridad actual de superadmin
  es la lista server-side del helper; no se inventan cuentas técnicas ni se
  reinterpretan strings `role` o campos del perfil como permisos.
- Email ausente/inválido se omite usando la misma validación del sender.
  No se exige perfil Firestore, emailVerified, compra ni nombre.
- Destinatario: `user.email` de Auth/backend, sin redirección. Nombre:
  `displayName.trim()` con espacios consecutivos normalizados; si queda vacío
  se omite y WelcomeEmail conserva `¡Hola!`.
- Template fijo `welcome`; dashboard fijo en `config.WELCOME_DASHBOARD_URL`:
  `https://reservaeldia.com.ar/dashboard`. El input no permite From, Reply-To,
  subject, HTML, template ni URL arbitrarios.
- `disabled` → `skipped / EMAIL_DISABLED`, `attempts=0`, sin llamar al sender.
- `sandbox` → `skipped / EMAIL_SANDBOX_BUSINESS_BLOCKED`, `attempts=0`, sin llamar
  al sender, incluso para la dirección del smoke. No se redirige al Gmail.
- Modo inválido → `skipped / EMAIL_INVALID_MODE`, sin sender. Estos gates tienen
  prioridad sobre la clasificación de elegibilidad del usuario.
- `production` continúa bloqueado en `sendTransactionalEmail`. Desde 2B.2 hay
  además un gate previo de activación: sin fecha termina skipped con attempts=0.
  Incluso con una fecha sintética válida, el sender real devuelve
  `EMAIL_PRODUCTION_NOT_ENABLED` sin render/SES. Los tests inyectan un sender
  falso para comprobar estados posteriores sin abrir el bloqueo central.

### Fallos y observabilidad

Después de obtener un resultado, el procesador intenta persistirlo y, si falla,
repite **solo esa escritura una vez**, con el mismo payload. Nunca repite SES.
Si ambas escrituras fallan devuelve `outcome: persistence_failed` con el resultado
observado; esto no afirma que esté persistido. El documento puede seguir
`dispatching` o contener el resultado si se perdió la confirmación de la escritura.
El MessageId conocido permanece en el resultado y en el log de error seguro.
Una invocación posterior ve un documento existente y no envía.

`unknown` y `dispatching` antiguo requieren inspección operativa; no se borran
ni se reintentan automáticamente, aunque esto implique perder la bienvenida.
Los rechazos SES también son terminales para este procesador. La creación de
cuenta no forma parte de estas operaciones; el adaptador de 2B.2 es posterior
al alta y nunca convierte un fallo de SES en un fallo de registro.

Logs `welcome_registration`: exclusivamente `template`, `userId`, `correlationId`,
`sourceEventId`, `mode`, `state`, `messageId`, `errorCode`, `attempts`.
`reservation_failed` indica error previo al sender; `already_exists` un duplicado.
`WELCOME_RESULT_PERSIST_FAILED` distingue resultado observado de persistencia
confirmada. No se registran email, displayName, bodies, tokens, Secrets ni errores
SDK completos; un fallo del logger tampoco habilita reenvíos.

### Verificación y siguiente fase

Con Node 20, ejecutar desde `functions`: `npm run build`, `npm run test:emails`,
`node --require ../scripts/local/networkGuard.cjs --test runtimeConfiguration.test.mjs`
y `npm run typecheck`. Desde la raíz: `npm run test:local:rules` mediante el
launcher aislado existente (proyecto demo, sin credenciales y solo loopback).
El launcher genera exclusivamente en esa copia `functions/.env.local` con
`EMAIL_MODE=disabled` y `WELCOME_EMAIL_ACTIVATION_AT=` vacío, para resolver los
parámetros del emulador sin prompts; no importa ni modifica los dotenv del proyecto real.
La suite nueva bloquea sockets/HTTP/fetch. La suite Rules comprueba denegaciones
de clientes y dos procesadores concurrentes contra Firestore emulado con sender
falso, además de lectura/escritura/borrado Admin de fixtures sintéticas exactas.

El adaptador se implementa en 2B.2, abajo. Sigue siendo trabajo separado habilitar
production en el sender/transporte, obtener acceso SES productivo y autorizar el
despliegue. No habrá replay automático de usuarios registrados como skipped en sandbox.

Validación local de 2B.1 (2026-09-25, Node 20.19.5): 53 tests nuevos del
procesador; suite completa email 120/120; configuración 8/8; aislamiento local
11/11; launcher Rules/countdown 1407/1407, incluyendo 36 denegaciones nuevas y
una prueba Admin/concurrencia con Firestore real emulado. Build y typecheck
aprobados. Los emuladores terminaron y sus puertos quedaron libres.
Lint de los ocho archivos de código afectados: cero diagnósticos nuevos; conserva
un `no-unsafe-finally` preexistente en `scripts/local/rules.test.mjs` (también
reproducido contra HEAD). No se declara lint global aprobado.
Evidencia ignorada por Git: `.local-isolation/welcome-2b1/` y
`.local-isolation/reports/run-SEKMWi/`. Sin deploy, envíos, cambios de Auth ni commit.

<a id="welcome-registration-2b2"></a>

## Adaptador Auth — Fase 2B.2 desplegada y validada en sandbox

Estado vigente: [cierre del 26/09/2026](#cierre-welcome-sandbox). La preparación,
prerrequisitos y resultados locales del 25/09 que siguen son históricos; sus
menciones de ausencia de deploy describen ese trabajo previo.

Autoridad del alta: Firebase Authentication `auth.user().onCreate()` desde
`firebase-functions/v1`, con la versión instalada 6.4.0. No se actualizó el SDK
ni se adoptó Auth v2 Preview. Es un evento asíncrono posterior a la creación,
no un blocking trigger ni un endpoint HTTP/callable.

```text
Auth user.create
  → onUserCreatedWelcomeEmail (welcomeRegistrationFunction.ts)
  → import lazy de processWelcomeRegistration
  → validación / create atómico en welcomeEmailDeliveries/{uid}
  → único sender existente, sujeto a sus bloqueos
```

Mapeo explícito: `uid`, `email`, `displayName`, `disabled`, `customClaims` del
UserRecord; `creationTime` desde `metadata.creationTime`; `sourceEventId` desde
`context.eventId`. No se consultan `usuarios/{uid}` ni Auth para reconstruir el
perfil; no se transportan providerData, passwordHash, tokens ni campos extra.

Email/password puede llegar sin nombre porque el cliente lo actualiza después:
el template usa `¡Hola!` inmediatamente. Google pasa por el mismo evento tanto
desde RegisterModal como LoginModal. Un primer sign-in federado crea Auth; un
login de una cuenta existente no es un alta. No se depende del modal, no se
espera a updateProfile y no hay backfill. La limitación de Auth v1 para el primer
sign-in con custom token permanece: ese caso no genera onCreate por sí solo.
[Contrato del evento y atributos](https://firebase.google.com/docs/functions/1st-gen/auth-events).

El procesador conserva `customClaims.admin === true` e `isSuperAdmin(uid)` de
`auth/adminAuth.ts`; este helper usa configuración server-side, sin I/O remoto.
No se duplicaron listas ni se excluye por nombre, dominio o email. Si el helper
falla, se registra `WELCOME_SUPERADMIN_LOOKUP_FAILED` antes de reservar/enviar.

### Activación productiva futura

`config.ts` declara `WELCOME_EMAIL_ACTIVATION_AT` como parámetro server-side,
**default vacío**. No se configuró una fecha real. La función pura
`welcomeActivationSkipReason` se usa antes de reservar el intento de negocio,
solo cuando mode es production y el usuario supera las reglas de elegibilidad.

| Configuración/dato | Resultado |
| --- | --- |
| Modo sandbox / disabled | Conserva EMAIL_SANDBOX_BUSINESS_BLOCKED / EMAIL_DISABLED, skipped, attempts=0; sin leer activación ni llamar al sender |
| Activación vacía | WELCOME_ACTIVATION_NOT_CONFIGURED, skipped, attempts=0 |
| Activación no canónica/válida | WELCOME_ACTIVATION_INVALID, skipped, attempts=0 |
| creationTime ausente/inválido | WELCOME_CREATION_TIME_INVALID, skipped, attempts=0 |
| Creación anterior al corte | WELCOME_BEFORE_ACTIVATION, skipped, attempts=0 |
| Creación igual/posterior al corte | Supera solo este gate; el sender conserva el bloqueo de production |

Formato de configuración: UTC ISO `YYYY-MM-DDTHH:mm:ss.sssZ`; límite inclusivo.
Se compara la fecha de creación Auth, nunca la hora de entrega del evento o del
retry. Un evento antiguo recibido más tarde sigue excluido. Todos los skips se
reservan atómicamente en la misma colección y son terminales; cambiar de modo o
fecha no vuelve a enviar. No se agregaron campos ni estado en el perfil.

### Retries, discovery y logging

Opciones declaradas: región `us-central1`, memoria 256 MB, timeout 60 s,
minInstances 0, maxInstances 2, `failurePolicy: true` (v1). Un fallo previo a la
reserva puede recuperar mediante retry de la plataforma. Una reserva existente
siempre impide otro intento, incluidos dispatching/unknown. Los rechazos SES y
fallos de persistencia terminales no solicitan otro envío. Se preserva la garantía
**at most one automatic attempt por UID**, sin colas, leases ni retries propios SES.
[Semántica de retries](https://firebase.google.com/docs/functions/retries?hl=en).

Declarar/importar el trigger no lee parámetros ni Secrets y no carga el
procesador, store, React Email o AWS SDK. Esos imports ocurren al invocar.
Se conserva el logging del procesador. Ante una falla del adaptador/runtime,
se emite `welcome_registration_adapter` con las nueve claves sanitizadas y
`WELCOME_REGISTRATION_FAILED`, sin error original. correlationId y attempts
quedan null si el adaptador no puede conocerlos; no se afirma que hubo cero
intentos. La excepción propagada al framework contiene únicamente el código
constante. La cuenta Auth ya existe y no se revierte por este error.

### Identidad y permisos pendientes, sin cambios remotos

Identidad propuesta y fijada en `config.WELCOME_SERVICE_ACCOUNT`:
`welcome-email-sender@reservaeldia-7a440.iam.gserviceaccount.com`.
Se separa del smoke `email-sandbox-sender`; no se creó la cuenta ni se otorgaron
roles. Antes del deploy se debe comprobar su existencia y configurar:

- Rol personalizado con `datastore.entities.create` y `datastore.entities.update`.
  El store usa Commit con exists=false/true; no lee, lista, borra ni abre
  transacciones, por lo que no necesita esos permisos adicionales. Restringir
  el binding a la base `(default)` cuando se configure IAM. IAM no da aquí una
  garantía de aislamiento por colección: el path fijo pertenece al código;
  las Rules de cliente no limitan Admin SDK. No usar Editor/Owner/Firebase Admin
  ni dar delete para resolver un problema de despliegue.
  [Permisos por operación Firestore](https://firebase.google.com/docs/firestore/security/iam?hl=en).
- `roles/secretmanager.secretAccessor` **en cada uno** de los dos Secrets existentes:
  `AWS_SES_ACCESS_KEY_ID` y `AWS_SES_SECRET_ACCESS_KEY`. Ya se declaran sus bindings
  mediante los SecretParam canónicos. El acceso se necesita desde el primer deploy
  por la inyección de Secrets, aunque el gate sandbox impida que el código los use.
  No copiar valores a dotenv ni crear Secrets nuevos.
  [Acceso por Secret](https://docs.cloud.google.com/secret-manager/docs/access-control).
- Ningún rol de lectura de Firebase Auth: UserRecord viene en el evento y la
  autoridad superadmin es local. El logging usa stdout/stderr del SDK; no llama
  directamente a la API Cloud Logging.

Separadamente, el operador de despliegue necesita `iam.serviceAccounts.actAs`
sobre esa cuenta (habitualmente roles/iam.serviceAccountUser), además de permisos
de deploy; el service agent administrado de Cloud Functions debe conservar sus
bindings. No son roles que se concedan al runtime. No requiere roles/run.invoker
ni un permiso público HTTP. Los permisos remotos reales **no se verificaron** aquí.

### Harness y validación antes del despliegue

La entrada demo registra únicamente este trigger adicional y delega al mismo
handler `.run`; omite service account y Secrets remotos. Exige EMAIL_MODE=disabled.
El launcher fuerza ese modo y activación vacía en entorno/configuración generados,
sin heredar valores reales. Los demás eventos/schedulers siguen sin registrarse;
los smoke endpoints HTTP continúan bloqueados.

`npm run test:local:rules` ejecuta también `scripts/local/welcomeAuth.test.mjs`:
creación email/password y Google con identidades sintéticas en Auth emulator,
onCreate real en Functions emulator y delivery skipped en Firestore emulator.
Se comprueban login existente, logs del procesador y ausencia de perfil; las
pruebas limpian solo sus UIDs/documentos demo. Las fixtures de Google son tokens
unsigned aceptados exclusivamente por el emulador, sin OAuth contra Google.
Los tests offline del adaptador están incluidos en `npm run test:emails`.

Inventario histórico previo a separar email: default **103 → 104**, Payments **3 → 3**;
único export agregado `onUserCreatedWelcomeEmail`. Se conserva testWelcomeEmail.
`testUtils/welcomeDiscovery.cjs` comprueba discovery SDK/CLI en loopback, bloquea
red externa y lecturas de parámetros, y usa el detector real con su límite
original de 10 s; no aumenta FUNCTIONS_DISCOVERY_TIMEOUT para esas mediciones.

Antes de desplegar: verificar IAM/Secrets y configuración superadmin canónica;
mantener EMAIL_MODE sandbox/disabled y activación vacía; confirmar/aplicar bajo
autorización las Rules backend-only de 2B.1; luego autorizar deploy de solo el
trigger y validar un alta controlada como skipped, sin correos. Validar también
el manejo operativo de fallos de reserva y conservar todos los delivery records.

Para solicitar SES production access, preparar el caso transaccional, URL del
sitio, destinatarios y procedimiento real de manejo de bounces/complaints, y
solicitarlo en `us-east-1`. La aprobación de AWS no habilita el sender del proyecto.
Después harán falta un cambio autorizado del gate production y allowlist del
sender/transporte, una fecha UTC autorizada, verificación operativa y un rollout
controlado. Retirar testWelcomeEmail después de validar el trigger y antes/cerca
de esa activación. Nada de esto se ejecutó en 2B.2.
[Requisitos de SES para salir del sandbox](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html).

Validación local de 2B.2 (2026-09-25, Node 20.19.5):

| Check | Resultado |
| --- | --- |
| Adaptador Auth / procesador | 32/32 y 53/53, incluidos duplicados/concurrencia, fallos antes de reserva, claims, activación y bloqueo productivo |
| Suite completa email | 152/152, sin red externa ni SES |
| Configuración / inventario / discovery unitario | 8/8, 10/10 y 2/2; también repetidos junto a los 32 del adaptador: 52/52 |
| Aislamiento del entorno local | 11/11; no hereda modo production ni fecha de activación |
| Rules, countdown y Auth real emulado | 1408/1408; Auth → Functions → Firestore, Google/password y login existente incluidos |
| Build / typecheck Functions | Aprobados; 48 copias compartidas sin cambios |
| Discovery SDK / CLI real | Dos SDK y cinco CLI aprobados; no cargan runtime email ni leen parámetros/Secrets |
| Inventario antes/después | 103 → 104 default; 3 → 3 Payments; los 103 endpoints previos conservan todas sus opciones, sin duplicados |
| Lint de 17 archivos afectados | Cero diagnósticos nuevos; conserva un error `no-unsafe-finally` en rules.test y 18 warnings en index, reproducidos contra HEAD |
| `git diff --check` | Aprobado |

CLI: cinco procesos nuevos, mínimo 1447 ms, mediana 2651 ms, máximo 4036 ms,
sin modificar el timeout habitual de 10 s. Baseline de esta sesión: tres
muestras, 1275/1662/2370 ms (mínimo/mediana/máximo). Son mediciones locales con
caché/carga variables, no una garantía temporal ni una comparación controlada.
Las seis comparaciones de manifiestos verificaron todos los campos de los 103
endpoints anteriores; el único parámetro nuevo es la activación con default vacío.

Evidencia ignorada por Git: `.local-isolation/welcome-2b2/` y
`.local-isolation/reports/run-D0I4fK/`. El launcher cerró sus procesos y dejó los
puertos libres. Se verificó por hash que transporte, sender, Rules, smoke tests
productivos, AWS credentials provider, dotenv real, frontend de Auth y lockfile
no cambiaron respecto del inicio de 2B.2. No se hizo deploy, envío ni commit.
Lint global no se declara aprobado por la deuda preexistente indicada.

<a id="migracion-email-codebase"></a>
## Source email independiente: migración validada y procedimiento conservado

**Estado vigente:** migrado por el operador y verificado en el
[cierre sandbox del 26/09](#cierre-welcome-sandbox). El rollback sigue disponible.
**Histórico del 25/09:** preparación local sin deploy, envíos, cambios IAM/Secrets ni commit.
El operador informó que el deploy del Auth trigger volvió a fallar después del
build con `Cannot determine backend specification / Timeout after 10000`.
Firebase CLI descubre el source completo antes de filtrar endpoints: seleccionar
un endpoint de default todavía cargaba sus 104 exports. No hay evidencia suficiente
para atribuir ese intento remoto a un único módulo. La separación elimina esa
dependencia para desplegar email; no promete resolver la latencia de default.

| Codebase | Source / entrada | Endpoints locales antes → después |
| --- | --- | --- |
| default | functions / lib/index.js | 104 → 101; todos los restantes mantienen opciones |
| payments | functions-payments / lib/payments/entrypoint.js | 3 → 3; mismos nombres, opciones y código |
| email | functions-email / lib/emails/entrypoint.js | 0 → 3: testTransactionalEmail, testWelcomeEmail, onUserCreatedWelcomeEmail |

La unión local sigue teniendo 107 nombres únicos. `getAdminUserByEmail` es una
consulta administrativa, no un sender, y permanece en default. No hay otros
endpoints de email en este traslado. Solo se retiran esos tres exports de index.
Los handlers, procesador, store, renderer, SES, From y Reply-To quedan intactos.

`functions/src/emails/entrypoint.ts` es la autoridad de exports. `build:email`
compila su grafo con `tsconfig.email-package.json` y copia únicamente el contrato
`firebaseEnvironment.cjs` desde el mapping canónico. El paquete generado incluye
email, `auth/adminAuth`, `firebaseAdmin` y ese contrato; no incluye index, Payments,
OpenAI, frontend ni otros dominios. `lib/`, `shared/` y `node_modules/` se generan
y se ignoran en Git. `functions-email/package.json` y su lock se versionan.
El lock es una proyección offline del lock de Functions, con versiones idénticas;
no usa dependencias `file:`, symlinks ni archivos externos en runtime. El paquete
React Email instalado incluye tooling de preview transitivo, conservado sin
actualizaciones. Su renderer y AWS SDK siguen siendo lazy en discovery.
El SDK Firebase v1 sí carga módulos propios de Firebase Admin/Firestore.

Configuración local ignorada: `functions-email/.env.reservaeldia-7a440`:

```dotenv
EMAIL_MODE=sandbox
WELCOME_EMAIL_ACTIVATION_AT=
```

Incluye además `SUPERADMINS_UIDS`, copiado **sin imprimirlo** de la autoridad
existente de Functions; no inventar otra lista. Es configuración normal necesaria
para conservar `isSuperAdmin`, aunque sandbox corta antes de esa comprobación.
No copiar el dotenv entero ni CLOUD_RUNTIME_CONFIG. No se modifica el dotenv
de default o Payments. `.env*`, `.secret*` y `.runtimeconfig.json` se excluyen
del upload; Firebase CLI sigue usando el dotenv local para inyectar estos valores.
Un checkout nuevo necesita preparar esa configuración local; no está en Git.

### Paridad remota y permisos

La captura [email-remote-2026-09-25.json](baselines/email-remote-2026-09-25.json)
se obtuvo mediante GETs de control plane con selección server-side de campos.
Fecha UTC dentro del archivo. Confirma dos recursos existentes con ownership
default (label ausente equivale a default) y ausencia del trigger Auth v1.

Ambos smoke tests: HTTPS privado gen2, Node 20, us-central1, 256 MiB, CPU 1,
timeout 20 s, concurrencia 1, min 0 / max 1. Service account:
`email-sandbox-sender@reservaeldia-7a440.iam.gserviceaccount.com`.
Se conservan URL cloudfunctions.net, URI Cloud Run, IAM check habilitado y
ausencia de allUsers/allAuthenticatedUsers en la política del servicio.
La captura no audita grants heredados de proyecto/organización. Principales
específicos se representan por hashes; no se registran datos personales.

Los tres endpoints declaran exclusivamente `AWS_SES_ACCESS_KEY_ID` y
`AWS_SES_SECRET_ACCESS_KEY`. Versiones capturadas en los smoke tests: 3 y 2,
respectivamente; son metadata, nunca valores. Firebase resolverá los bindings al
desplegar: si se rotaron entre captura y deploy, detenerse y revisar esa diferencia.
No agregar bindings MP/OpenAI ni copiar Secrets al paquete.

Auth conserva v1 `auth.user().onCreate()`, us-central1, 256 MB, timeout 60 s,
min 0 / max 2, failurePolicy=true y
`welcome-email-sender@reservaeldia-7a440.iam.gserviceaccount.com`.
Los [prerrequisitos IAM](#identidad-y-permisos-pendientes-sin-cambios-remotos)
siguen aplicando: runtime Firestore create/update, secretAccessor por Secret;
operador actAs. No se otorgan permisos remotos en esta preparación.

### Verificación local reproducible

Desde la raíz, con Node 20 para builds/tests. La herramienta instalada de Firebase
es 14.4.0; no actualizarla durante esta migración.

```powershell
npm.cmd --prefix functions run build
npm.cmd --prefix functions run build:payments
npm.cmd --prefix functions run build:email
npm.cmd --prefix functions run typecheck
npm.cmd --prefix functions run typecheck:email
node functions/node_modules/typescript/bin/tsc --noEmit --project functions/tsconfig.payments.json
npm.cmd --prefix functions run test:emails
node --test --test-concurrency=1 functions/emailPackage.test.mjs functions/paymentsPackage.test.mjs functions/runtimeConfiguration.test.mjs functions/discoveryInitialization.test.mjs
npm.cmd run test:local:rules
$cli = Join-Path $env:APPDATA 'npm/node_modules/firebase-tools'
node functions/scripts/verifyEmail.cjs autonomy
node functions/scripts/verifyEmail.cjs discovery email "$cli" 10
node functions/scripts/verifyEmail.cjs discovery default "$cli" 3
node functions/scripts/verifyEmail.cjs discovery payments "$cli" 3
node functions/scripts/verifyEmail.cjs plan "$cli"
git diff --check
```

Preparar dependencias de `functions-email` con `npm.cmd ci --prefix functions-email`
en un entorno autorizado para instalar paquetes, o usar `verifyEmail.cjs materialize`
offline **solo en destino sin node_modules** con las versiones del lock ya instaladas
en Functions. Ese materializador copia paquetes; no crea links a Functions.
Cloud Build usa el package/lock autónomo y `gcp-build` vacío: recibe JS ya compilado.

El verificador usa `Delegate.discoverBuild()` y el wrapper real
`node_modules/.bin/firebase-functions`, en procesos nuevos y entorno allowlisted.
No llama solamente detectFromPort, no importa un comando deploy y no aumenta
FUNCTIONS_DISCOVERY_TIMEOUT. Bloquea conexiones externas en padre e hijo; loopback
solo para discovery. Guarda el tiempo del detector sujeto al límite de 10 s y el
total incluyendo resolución/shutdown del wrapper. Esos tiempos son distintos.
Las suites de inventario guardan manifiestos locales para el planner.

El planner real de CLI 14.4.0, ejecutado offline con metadata sanitizada, comprueba:

| Paso | Updates | Creates | Deletes / recreates |
| --- | --- | --- | --- |
| functions:email:testTransactionalEmail | testTransactionalEmail | 0 | 0 / 0 |
| functions:email:testWelcomeEmail | testWelcomeEmail | 0 | 0 / 0 |
| functions:email:onUserCreatedWelcomeEmail | 0 | onUserCreatedWelcomeEmail | 0 / 0 |

Simula también rollback a default después de cada paso. Solo la metadata de los
dos smoke tests y ausencia Auth son hechos remotos comprobados; la existencia de
los otros 104 y los estados intermedios de ownership son simulados.

Resultados de esta separación local (2026-09-25, hora de Buenos Aires):

| Verificación | Resultado |
| --- | --- |
| Emails completos, incluidos Welcome/registro/trigger | 152/152, red bloqueada |
| Paquete email / inventario Payments / configuración / inicialización | 9/9, 10/10, 8/8, 2/2 |
| Entorno e inicialización cliente | 12/12 |
| Rules + Auth/Functions/Firestore emulados + countdown | 1408/1408 |
| Builds y typechecks | default, payments, email aprobados; Node 20.19.5 |
| Paquete fuera del repositorio | Node 22.13.1 y 20.19.5; 365 paquetes copiados, 25 opcionales de otras plataformas no instalados; cero imports externos, red o sender |
| Árbol instalado | npm ls --omit=dev --all, exit 0; lock proyectado sin actualizar versiones |
| Lint de los 15 archivos de código afectados | 0 errores; 18 warnings preexistentes de index |
| Protección de alcance | 59 archivos críticos byte a byte sin cambios; objetos default/payments de firebase.json intactos |
| Seguridad del source | 31 archivos, sin patrones de credenciales; dotenv ignorado; AWS solo por bindings |
| git diff --check | Aprobado |

Discovery real con CLI 14.4.0 / host Node 22.13.1, timeout sin ampliar, procesos nuevos:

| Serie | Muestras / endpoints por muestra | Mínimo / mediana / máximo del detector | Fallos / timeouts |
| --- | --- | --- | --- |
| email, con otros checks concurrentes | 10 / 3 | 1055 / 1668 / 8545 ms | 0 / 0 |
| email, sin builds/tests concurrentes | 10 / 3 | 758 / 1051 / 2825 ms | 0 / 0 |
| default | 3 / 101 | 1443 / 2326 / 2570 ms | 0 / 0 |
| payments | 3 / 3 | 1842 / 2425 / 4556 ms | 0 / 0 |

En la segunda serie email, el total del wrapper incluye unos 4 s de cierre;
máximo total 7275 ms. Con carga compartida, el máximo total fue 13822 ms, mientras
el detector sujeto al timeout estuvo en 8545 ms. No confundir ambas mediciones ni
prometer tiempos idénticos en otra máquina o un deploy real.

Limitaciones de la validación: una primera ejecución concurrente del test de
inicialización default superó sus 30 s; pasó al repetir secuencialmente. El harness
aprobó los 1408 tests pero Windows bloqueó inicialmente su limpieza: se verificó
la identidad demo del árbol propio, se cerró con permiso local y se comprobaron
puertos libres. Los archivos de evidencia conservan tanto ese fallo de limpieza
como su resolución. Node 20 encontró un EPERM al resolver el alias Windows del
directorio temporal; la prueba autónoma se repitió con `--preserve-symlinks`, tras
materializar dependencias rechazando cualquier link. Node 22 pasó sin ese flag.
No se cambian flags de producción por este límite local.

Evidencia local ignorada: `.local-isolation/email-codebase/` (manifiestos, ambas
series email, planner, autonomía, logs y cleanup.json) y
`.local-isolation/reports/run-MhqiV8/` (Rules/emuladores). La metadata remota
sanitizada sí se versiona. El worktree incluye cambios de fases anteriores;
no atribuir todo `git diff` a esta separación.

### Secuencia manual de migración: referencia de la operación completada

Se conserva para trazabilidad y recuperación. No ejecutar nuevamente como parte
del cierre: los dos smoke tests ya pertenecen a email y el Auth trigger está ACTIVE.

No desplegar default primero: allí se retiraron exports que aún existen remotamente.
No aceptar ninguna propuesta de borrar/recrear smoke endpoints ni ningún recurso
fuera del selector. Usar exclusivamente selectores completos por endpoint.

1. Confirmar proyecto, IAM indicado arriba, Rules backend-only de deliveries,
   configuración sandbox/activación vacía y build/checks aprobados. Capturar metadata
   fresca sin sobrescribir el baseline y comparar antes de operar:

   ```powershell
   $cli = Join-Path $env:APPDATA 'npm/node_modules/firebase-tools'
   $baseline = 'docs/operations/baselines/email-remote-2026-09-25.json'
   node functions/scripts/captureEmailMetadata.cjs "$cli" .local-isolation/email-codebase/before-deploy.json
   node functions/scripts/compareEmailMetadata.cjs "$baseline" .local-isolation/email-codebase/before-deploy.json
   ```

   Si falla, detenerse. No invocar los endpoints HTTP: producirían emails.

2. **Primer y único deploy inicial:**

   ```powershell
   firebase.cmd deploy --only "functions:email:testTransactionalEmail" --project reservaeldia-7a440
   ```

3. Verificar el update, URLs, opciones, bindings/versiones, privacidad y ownership
   del primero; el segundo debe continuar en default:

   ```powershell
   node functions/scripts/captureEmailMetadata.cjs "$cli" .local-isolation/email-codebase/after-technical.json
   node functions/scripts/compareEmailMetadata.cjs "$baseline" .local-isolation/email-codebase/after-technical.json testTransactionalEmail
   ```

4. Migrar el segundo y verificar ambos:

   ```powershell
   firebase.cmd deploy --only "functions:email:testWelcomeEmail" --project reservaeldia-7a440
   node functions/scripts/captureEmailMetadata.cjs "$cli" .local-isolation/email-codebase/after-welcome.json
   node functions/scripts/compareEmailMetadata.cjs "$baseline" .local-isolation/email-codebase/after-welcome.json testTransactionalEmail,testWelcomeEmail
   ```

5. Crear exclusivamente el Auth trigger:

   ```powershell
   firebase.cmd deploy --only "functions:email:onUserCreatedWelcomeEmail" --project reservaeldia-7a440
   gcloud.cmd functions describe onUserCreatedWelcomeEmail --no-gen2 --region=us-central1 --project=reservaeldia-7a440 --format="yaml(name,status,runtime,entryPoint,eventTrigger,serviceAccountEmail,availableMemoryMb,timeout,maxInstances,secretEnvironmentVariables.key,secretEnvironmentVariables.version,labels.firebase-functions-codebase,environmentVariables.EMAIL_MODE,environmentVariables.WELCOME_EMAIL_ACTIVATION_AT)"
   ```

   Esperar ACTIVE, nodejs20, eventType user.create, identidad welcome indicada,
   ambos AWS bindings, label email, sandbox y activación vacía. Este describe
   selecciona solo dos variables normales; nunca imprimir el entorno completo.

6. Solo después de comprobar sandbox: en Firebase Console → Authentication → Users,
   agregar **una sola cuenta sintética** con dirección única
   `welcome-codebase-<UUID>@example.invalid` y contraseña aleatoria temporal.
   No solicitar verificación/reset ni invocar smoke tests. Registrar su UID y hora.
   No crear documento usuarios ni iniciar sesión para completar la prueba.
7. Consultar como operador exclusivamente `welcomeEmailDeliveries/{uid}` en Firestore
   Console. Esperar status=skipped, attempts=0,
   skipReason=EMAIL_SANDBOX_BUSINESS_BLOCKED; registrar sourceEventId/correlationId.
   No compartir email, datos personales o cuerpos.
8. Revisar logs seleccionados de esa ejecución:

   ```powershell
   $uid = '<UID sintetico registrado>'
   gcloud.cmd logging read "resource.type=cloud_function AND resource.labels.function_name=onUserCreatedWelcomeEmail AND resource.labels.region=us-central1 AND jsonPayload.userId=$uid" --project=reservaeldia-7a440 --freshness=30m --limit=20 --format="json(timestamp,jsonPayload.template,jsonPayload.userId,jsonPayload.sourceEventId,jsonPayload.correlationId,jsonPayload.mode,jsonPayload.state,jsonPayload.attempts,jsonPayload.messageId,jsonPayload.errorCode)"
   ```

   Esperar welcome/sandbox/skipped/0, MessageId null y errorCode sandbox. El código
   corta antes del sender y tests lo demuestran. Ausencia de logs SES por sí sola
   no prueba ausencia de una llamada de red; no hacer esa afirmación sin esta
   evidencia positiva del gate. Una reserva fallida requiere diagnóstico IAM,
   no crear varias cuentas ni borrar records para provocar retries.
9. Documentar el resultado sanitizado y borrar **solo esa cuenta Auth sintética**
   por su UID en Console. Conservar el delivery como evidencia y protección ante
   eventos repetidos; no eliminarlo durante el período de retries. No backfill.

### Rollback aislado de ownership: no ejecutado

`firebase.email-rollback.json` apunta al mismo paquete email pero declara codebase
default. Evita cargar el default completo y permite actualizar el recurso existente.
Tras migrar ambos, devolver primero Welcome y después el técnico:

```powershell
firebase.cmd deploy --config firebase.email-rollback.json --only "functions:default:testWelcomeEmail" --project reservaeldia-7a440
node functions/scripts/captureEmailMetadata.cjs "$cli" .local-isolation/email-codebase/rollback-welcome.json
node functions/scripts/compareEmailMetadata.cjs "$baseline" .local-isolation/email-codebase/rollback-welcome.json testTransactionalEmail
firebase.cmd deploy --config firebase.email-rollback.json --only "functions:default:testTransactionalEmail" --project reservaeldia-7a440
node functions/scripts/captureEmailMetadata.cjs "$cli" .local-isolation/email-codebase/rollback-technical.json
node functions/scripts/compareEmailMetadata.cjs "$baseline" .local-isolation/email-codebase/rollback-technical.json
```

Si solo se migró el técnico, ejecutar únicamente su rollback y comparación final.
No usar functions:delete para estos dos endpoints. El rollback de ownership no
revierte revisiones de código/Secrets ni transforma el source default local; si
se abandona la migración, restaurar sus exports y revisar inventario en un cambio
local separado **antes** de un despliegue general de default.

Si el Auth trigger nuevo presenta un problema, detenerlo por separado (no existía
antes de esta migración):

```powershell
firebase.cmd functions:delete onUserCreatedWelcomeEmail --region us-central1 --project reservaeldia-7a440 --force
```

Esto no borra usuarios ni delivery records, no modifica los smoke tests y no
deshace invocaciones ya en curso. En sandbox esas invocaciones siguen bloqueadas
para SES. No borrar records, no recrear usuarios para retries, no habilitar production.

## Verificación histórica del cierre inicial (2026-09-18)

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
- Email está migrado y validado hasta sandbox. El inventario local es 101/3/3;
  el remoto 102/3/3 por generatePublishedShareImage adicional en default.
  Su revisión corresponde a una tarea separada; ver [evidencia de cierre](#cierre-welcome-sandbox).
- Node 22: runtime actual Node 20; el AWS SDK advierte/requerirá Node >=22 en
  versiones futuras. OpenAI 7.5.0 ya declara Node >=22 y genera una advertencia
  preexistente. No se actualizó Node ni OpenAI en esta fase.
- Eventos SES, delivery, bounce, complaint y suppression lists.
- Templates y emails reales de negocio, colas/idempotencia cuando corresponda.

El cierre inicial no conectó eventos de negocio al sender. Fase 2B.2 agrega el
adaptador Auth, ahora desplegado y validado en sandbox por el operador; los envíos
productivos siguen bloqueados. No se agregaron campañas ni otros eventos de negocio.
Las preparaciones anteriores no ejecutaron commits desde el agente; este cierre
sí incluye el commit autorizado por el operador, conservando el historial previo.
