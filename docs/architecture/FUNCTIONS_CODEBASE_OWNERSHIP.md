# Ownership de Firebase Functions y codebases

Status: Canonical Contract.
Decisión: aceptada para la Etapa 1 de ownership, 2026-09-27.

Esta es la autoridad normativa para elegir la codebase de una Function nueva o
modificada. El [índice documental](../DOCUMENTATION_INDEX.md#authority-and-conflicts)
gobierna su relación con los contratos de negocio, datos y seguridad: asignar una
codebase no cambia permisos, comportamiento ni autoriza un deploy.

## Autoridad y representación verificable

- Este documento define criterios, dominios y decisiones de ownership.
- [functionOwnership.json](../../functions/functionOwnership.json) es el único
  registro machine-readable de asignaciones exactas de endpoints locales. Los
  tests derivan sus listas actuales de ese registro; no de snapshots de migración.
- [firebase.json](../../firebase.json) mantiene la configuración ejecutable de
  sources. El gate compara sources y `package.json.main` con el registro.
- Los runbooks y baselines fechados conservan evidencia operativa. No asignan
  ownership a nuevas Functions ni certifican el estado remoto actual.

`default` es conceptualmente **core**. Su nombre técnico sigue siendo `default`.
Core tiene responsabilidades explícitas: no es un destino por omisión para todo
lo que no encaje. La cantidad de endpoints no decide una separación.

## Tabla canónica de dominios

Source significa el directorio desplegable; los tres entrypoints TypeScript y
la lógica mantenida viven en `functions/src`. Los paquetes independientes se
compilan desde esas fuentes y contratos compartidos; sus `lib/` y `shared/`
generados no constituyen otra implementación mantenida.

| Domain (id del registro) | Codebase | Source | Entrypoint canónico | Configuración relevante, por nombre | Secrets permitidos/relevantes | Notas |
| --- | --- | --- | --- | --- | --- | --- |
| Identity, perfiles y soporte (`identity-support`) | default / core | functions | functions/src/index.ts | SUPERADMINS_UIDS; fallback CLOUD_RUNTIME_CONFIG → superadmins.uids | Ninguno | Auth/perfiles/directorio y soporte; getAdminUserByEmail no es un sender. |
| Drafts (`drafts`) | default / core | functions | functions/src/index.ts | Configuración compartida de render/Maps | Ninguno | Copias de plantillas hacia borradores, papelera y mantenimiento. |
| Editor (`editor`) | default / core | functions | functions/src/index.ts | Según el flujo alcanzado | Ninguno inicialmente | Dominio asignado para nuevas operaciones propias del editor. Los endpoints existentes se registran por su responsabilidad más concreta: templates, drafts o publicación. |
| Templates (`templates`) | default / core | functions | functions/src/index.ts | SUPERADMINS_UIDS; GOOGLE_MAPS_EMBED_API_KEY | Ninguno | Gestión editorial y documentos/workspaces de templates. |
| Catálogos y presets (`catalogs-presets`) | default / core | functions | functions/src/index.ts | ICONOS_V2_*, DECOR_V1_*, COUNTDOWN_NEW_* y variantes NEXT_PUBLIC_; SUPERADMINS_UIDS | Ninguno | Iconos, decoraciones, texto y countdown; incluye sus triggers/jobs. |
| Dashboard/home editorial (`dashboard-home`) | default / core | functions | functions/src/index.ts | SUPERADMINS_UIDS | Ninguno | Configuración editorial del home. |
| Publication, delivery, RSVP y visitas (`publication-delivery`) | default / core | functions | functions/src/index.ts | GOOGLE_MAPS_EMBED_API_KEY; NEXT_PUBLIC_GOOGLE_MAPS_API_KEY como fallback; PUBLISH_SHARE_IMAGE_ENABLED; PUBLISH_SHARE_IMAGE_DEFAULT_URL; PUPPETEER_EXECUTABLE_PATH | PUBLIC_VISIT_SIGNING_SECRET, sólo verInvitacionPublicada | Lifecycle, preview, publicación y estado de checkout persistido siguen en core aunque usen módulos de payments/. |
| Pricing y descuentos (`pricing-discounts`) | default / core | functions | functions/src/index.ts | PRICING_CONFIG_ALLOW_LEGACY_FALLBACK; SUPERADMINS_UIDS | Ninguno | No ejecutan por sí mismos operaciones del proveedor de pagos. |
| Business analytics (`business-analytics`) | default / core | functions | functions/src/index.ts | SUPERADMINS_UIDS | Ninguno | Eventos, consultas, exports y jobs pertenecen al mismo dominio. |
| Designer AI (`designer-ai`) | default / core | functions | functions/src/index.ts | SUPERADMINS_UIDS; modelo/configuración de functions/src/designerAi | OPENAI_API_KEY, sólo designerAiChat | El nombre del dominio no crea una codebase designer-ai. |
| Integración Mercado Pago (`mercado-pago`) | payments | functions-payments | functions/src/payments/entrypoint.ts | MERCADO_PAGO_PUBLIC_KEY; MERCADO_PAGO_WEBHOOK_URL; GOOGLE_MAPS_EMBED_API_KEY por el render compartido | MERCADO_PAGO_ACCESS_TOKEN; MP_WEBHOOK_SECRET sólo en mercadoPagoWebhook | Efecto principal: ejecutar o recibir operaciones propias del proveedor. No todo checkout pertenece a Payments. |
| Entrega transaccional (`transactional-email`) | email | functions-email | functions/src/emails/entrypoint.ts | EMAIL_MODE; WELCOME_EMAIL_ACTIVATION_AT; SUPERADMINS_UIDS; constantes de remitente/región en emails/config.ts | AWS_SES_ACCESS_KEY_ID; AWS_SES_SECRET_ACCESS_KEY | Senders, smoke privados y triggers cuyo efecto principal es enviar email transaccional. |

No se asignan owners humanos inexistentes. Los contratos específicos conservan
ownership de estado y permisos. Las allowlists son límites máximos; cada endpoint
debe declarar sólo los Secrets que necesita. No usar `setGlobalOptions` para
propagar Secrets a un dominio completo.

## Antes de crear o modificar una Function

1. Identificar dominio, estado consultado/modificado y efecto externo principal.
2. Consultar esta tabla y la asignación exacta del registro antes de elegir un
   entrypoint. Seguir la codebase ya asignada al dominio. Los dominios explícitos
   de core usan `default`.
3. Si no hay asignación o hay responsabilidades incompatibles, registrar primero
   una decisión arquitectónica acotada en este documento: pregunta, alternativas,
   evidencia, owner propuesto y estado `proposed`/`accepted`. No agregar por
   inercia a `default` ni crear automáticamente otra codebase. La decisión debe
   estar aceptada antes de exportar el endpoint; continuar lo independiente.
4. Una nueva codebase requiere una necesidad concreta de aislamiento por
   discovery, configuración, identidad/IAM, proveedor externo, dependencias o
   cadencia/operación de despliegue. Un dominio nuevo o un número alto de Functions
   no bastan. Cualquier migración necesita su propio alcance y plan autorizado.
5. Implementar en la fuente canónica del dominio y exportar desde su entrypoint.
   Registrar explícitamente nombre, dominio, codebase, regiones, bindings y firma
   de metadata en el JSON. Si cambian opciones de un endpoint existente, revisar
   compatibilidad y evidencia antes de actualizar su firma.
6. Ejecutar el gate de ownership y los tests funcionales pertinentes. Incluir en
   la revisión la asignación, opciones y motivo de cambios de metadata; el registro
   no debe regenerarse automáticamente para hacer pasar una prueba.

Un scheduler pertenece al dominio cuyo estado/flujo mantiene. No existe una
codebase genérica de schedulers. Compartir una biblioteca no obliga a compartir
codebase. El nombre público o la carpeta de implementación no determinan
ownership. Una feature puede tener endpoints en codebases distintas porque sus
responsabilidades son distintas.

| Caso | Decisión |
| --- | --- |
| Nueva operación o webhook Mercado Pago | payments, dominio mercado-pago; binding mínimo del proveedor. |
| Nuevo sender o trigger que envía email | email, dominio transactional-email; reutilizar infraestructura transaccional. |
| Nueva Function Designer AI | default, dominio designer-ai, mientras no exista otra decisión aceptada. |
| Nueva Function RSVP | default, dominio publication-delivery. |
| Scheduler que purga drafts o procesa analytics | default, dominio drafts o business-analytics respectivamente; el trigger no elige codebase. |
| Function transversal | Identificar quién posee la mutación/efecto principal y seguir su dominio. Reutilizar bibliotecas; si no hay dueño inequívoco, resolver una decisión acotada antes del export. Por ejemplo, consultar un checkout persistido es core; cobrar en el proveedor es payments. |

## Registro y guardrails

El registro conserva `schemaVersion`, codebases/sources/entrypoints, asignación de
dominios y una fila por endpoint. `regions` expresa su identidad pública junto con
`name`; `secrets` expresa bindings por nombre, nunca valores.

`manifestHash` reutiliza `endpointHash` de
[paymentsManifest.cjs](../../functions/testUtils/paymentsManifest.cjs): SHA-256
del endpoint SDK serializado canónicamente, **completo**. Protege nombre,
región, generación, trigger (incluidos filtros/horarios/retry), memoria, CPU,
timeout, concurrencia, min/max instances, service account, ingress, labels y
bindings. Se preservan `null`/opciones omitidas sin inventar defaults efectivos.
Ante una diferencia, inspeccionar el manifest local producido por el test y la
declaración fuente. No consultar valores de Secrets. No actualizar baselines
históricos para incorporar nuevos endpoints: sus pruebas son paridad del subconjunto
original, no un segundo inventario actual.

[functionOwnership.cjs](../../functions/testUtils/functionOwnership.cjs) verifica
registro completo, unión sin pérdidas, unicidad nombre/región (independiente de
generación), fronteras, metadata y allowlists. Payments/Email no pueden reaparecer
en default. Los tests de packages existentes consumen el mismo validador; los
negativos prueban exports desconocidos, movimientos, duplicados y deriva.

La configuración normal se comprueba por nombres con las allowlists de las tres
codebases en `functionOwnership.json`; ningún Secret puede declararse en dotenv.
El gate inspecciona los nombres de los archivos originales **antes** de excluirlos
de la copia aislada. El predeploy existente verifica también los nombres del
source seleccionado. No carga valores en `process.env`, ni los copia ni imprime.
No constituye una auditoría completa de IAM ni de configuración remota.

<a id="default-environment"></a>

### Entorno explícito de default — decisión aceptada, 2026-09-27

El source y el ownership actual determinan qué configuración necesita cada
codebase. Configuración remota sin consumidor demostrado es drift heredado,
no una obligación de restaurarla en source.

La allowlist del **dotenv de despliegue actual** de default es
`SUPERADMINS_UIDS` y `GOOGLE_MAPS_EMBED_API_KEY`. Sus bindings permitidos siguen
siendo `OPENAI_API_KEY` únicamente en `designerAiChat` y
`PUBLIC_VISIT_SIGNING_SECRET` únicamente en `verInvitacionPublicada`.
Las listas ejecutables se mantienen en el registro único.

Las seis variables MP heredadas no tienen consumidores efectivos en default;
su retiro del entorno de las 101 Functions en el próximo deploy es intencional.
`EMAIL_MODE` tampoco tiene consumidor allí: se retiró del dotenv de default y
queda en email. Declarar parámetros Secret por un import compartido no equivale
a vincularlos o necesitarlos en runtime. Ver el
[recorrido de consumidores y decisión operativa](../operations/BACKEND_CONFIGURATION_ISOLATION.md#default-environment).

Esta allowlist no inyecta las variables de plataforma/SDK ni los controles del
lanzador aislado. Los flags opcionales y fallbacks que el código sabe leer siguen
implementados, sin activarlos ni cambiar sus defaults: no estaban configurados en
el dotenv ni en el entorno remoto inspeccionado. Para configurarlos explícitamente,
verificar su consumidor/efecto y actualizar esta decisión y la allowlist. No
eliminar configuración vigente con consumidor sólo para igualar una lista.
El `.env.local` sintético del emulador combinado pertenece a su wrapper de pruebas;
no es configuración del entrypoint productivo de default ni se copia a producción.

Comando reproducible desde el repositorio, con dependencias y CLI fijadas ya
preparadas por el [flujo local](../operations/DEVELOPMENT_WORKFLOW.md#verification-5a):

```sh
npm --prefix functions run verify:ownership
```

Si se reutiliza una instalación preparada existente, se puede indicar su directorio
`firebase-tools` con `-- --cli <directorio>`; el runner exige la misma versión
fijada. No busca una CLI global ni instala herramientas durante la verificación.

El gate copia fuentes actuales (incluidos cambios sin commit), sin `.env`,
`.secret*`, credenciales ni builds existentes. Usa un HOME vacío, bloqueo de red
externa, tres builds, tests secuenciales y discovery real del wrapper CLI fijado.
Sólo escribe en `.local-isolation/`. Reutiliza las dependencias instaladas de
Functions cuyos locks proyectados verifican los tests; no reemplaza una prueba
de instalación autónoma de cada paquete. La identidad de proyecto usada para
resolver metadata de Auth v1 no autoriza conexiones ni invocaciones remotas.
Los tests de comportamiento existentes sólo ejercitan colaboradores sintéticos.

`verify:local` lo exige antes de su wrapper de handlers/emuladores; el workflow
normal de CI ejecuta `verify:local`. Un export nuevo sin registro hace fallar ese
stage y bloquea las etapas posteriores. No hay auto-registro ni fallback a core.
El gate no despliega ni demuestra que el inventario remoto coincida.

## Estado local y evidencia remota

Snapshot de adopción, 2026-09-27: 101 endpoints en default, 3 en payments y 3 en
email, total local 107. El registro/test es la autoridad del inventario vigente;
esta cifra es sólo el snapshot inicial, no un límite de crecimiento.

El ownership local puede adelantarse a una migración productiva. En el HEAD
revalidado para esta etapa, el [cierre de Email del 26/09](../operations/TRANSACTIONAL_EMAIL_SANDBOX_RUNBOOK.md#cierre-welcome-sandbox)
ya registra los tres endpoints en email, trigger Auth ACTIVE y prueba de evento
en sandbox con `skipped/attempts=0`. El envío automático de negocio en production
continúa bloqueado. No corresponde afirmar que la migración aún no ocurrió ni
repetirla basándose en la auditoría anterior.

La [reconciliación inicial del 27/09](../operations/FUNCTIONS_STAGE2_RECONCILIATION.md)
registró 102/3/3 (108). El [saneamiento posterior de default](../operations/DEFAULT_DEPLOY_READINESS.md)
retiró exclusivamente `generatePublishedShareImage`, clasificada B y sin export
local, tras revalidar sus precondiciones. El remoto quedó 101/3/3 (107), sin cambios
en los otros endpoints. No se agregó un export temporal ni se restauró su entorno.

Los 14 máximos remotos inicialmente inciertos (12 default y 2 payments) fueron
adoptados explícitamente en source por decisión actual del operador: preservar
20/34/60 y evitar cambios accidentales de capacidad. No se afirma haber recuperado
su intención histórica ni optimizado esos límites. El informe de saneamiento
enlazado registra esta decisión y validación; se retiraron los 14 `deployBlocker`
y se actualizaron sus hashes de metadata por ese único cambio. Los demás atributos y ownership
se conservan. El predeploy existente no tiene blockers registrados para esas
codebases; esto no autoriza ejecutar un deploy ni habilitar envíos Email.

**Email: migración e infraestructura revalidadas; activación productiva pendiente.**
Los tres endpoints están ACTIVE en email, modo sandbox y fecha vacía. El operador
confirmó que SES sigue en sandbox. No repetir migración, Auth ni grants ya
correctos. Production requiere resolver los prerrequisitos del runbook; este
estado local/remoto no constituye autorización para habilitar envíos de negocio.

## Mantenimiento

Actualizar este documento al aceptar un dominio/frontera o criterio nuevo, y el
registro al cambiar asignaciones/opciones autorizadas. Los demás documentos
enlazan esta autoridad, sin copiar la tabla. Cambios de runtime funcional,
identidad o contratos requieren su revisión específica; editar el JSON no los
autoriza. `DATA_MODEL.md` mantiene autoridad de datos, no de codebases.
