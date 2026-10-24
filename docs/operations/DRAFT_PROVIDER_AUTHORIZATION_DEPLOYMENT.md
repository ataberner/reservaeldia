# Preparación del despliegue de autorización de borradores y privacidad de proveedores

Status: Authorized Deployment — en curso; corte intermedio 24/10/2026 01:49:57 UTC. Ver registro de ejecución al final.

**Actualización de autorización, 24/10/2026 UTC:** el usuario confirmó «Sí,
continuar y dejar A/B pendiente». Se omiten los canarios autenticados A/B y la
creación de recursos sintéticos remotos. No se repiten las suites locales
aprobadas. Se mantienen integridad/destino, conservación de configuración,
guards de Rules, IAM condicionado, revisiones/tráfico/drenaje, lecturas posteriores
y precondiciones de los doce objetos. Tras reabrir se comprueba únicamente el
rechazo anónimo de los tres handlers, sin acceder a contenido ni provocar writes.
Esta decisión reemplaza el bloqueo por A/B descrito en las secciones históricas:
el aislamiento entre cuentas queda acreditado localmente, sin nueva validación
autenticada en producción. La autorización de despliegue restante no cambia.

La comparación previa de entorno encontró valores uniformes y coincidentes con
los dotenv locales en default (103) y payments (3). Email tiene sus tres nombres
permitidos presentes pero valores diferentes entre endpoints. Para conservarlos,
los tres despliegues Email serán individuales con overlay privado de la
configuración efectiva del endpoint seleccionado. No se unifica ni cambia su
activación; esta preservación puntual no introduce una fuente de configuración
permanente ni una autorización para enviar mensajes.

**Ejecución del 23/10/2026, 00:32–00:38 UTC del 24/10:** autorización explícita
recibida para los dos artefactos, 11+98 Functions, doce cambios condicionados de
metadata y contención/reapertura de los tres servicios. La transición progresiva
de los ocho consumidores fue aceptada, con pagos/webhooks habilitados e IAM
intacto. No se debe volver a pedir esa autorización para el mismo alcance.

**Registro histórico de la parada anterior a toda mutación:** faltaban las cuentas Firebase sintéticas
preexistentes A/B y sesiones verificables. El pedido ordena detenerse si falta
una identidad necesaria. Operador ADC identificado con binding de propietario
existente; candidato fijado, bases de Rules y 109 identidades sin deriva
observada, doce precondiciones live coincidentes. Ningún servicio fue contenido,
ninguna Function/Rules desplegada y ningún token retirado. Las 109 Functions
continuaban en Node 20 según esa captura. Resultado por alias y límites en
la [última sección del informe](../testing/DRAFT_PROVIDER_AUTHORIZATION.md#ejecución-autorizada-detenida-durante-la-preparación).

Candidato: `provider-auth-5ff9bb85217c-44d15fc46b29f1d2`, archivo privado local
`.local-isolation/provider-auth-release-2026-10-24T00-38-30-741Z-SFCXaw/candidate.tar.gz`,
SHA256 `527275585c92ea395e845890941da357a4b1343b1bc547b26960dfe2d03627a7`.
Es un snapshot mínimo con fuentes verificadas y sin dotenv, Ads ni evidencia
privada; **no desplegar directamente esa carpeta limpia**. La carpeta operativa
se materializó separadamente, conservando la configuración privada efectiva;
A/B queda pendiente por decisión del usuario. Mantener la comparación privada,
los predeploy originales y las lecturas/guards de cada tramo. CLI 14.4 puede
resolver defaults Email si falta el overlay; no permitir
que una preparación incompleta altere la configuración de negocio.

La autorización posterior habilita exclusivamente el despliegue acotado aquí
registrado: **ya hay cambios remotos en curso**. La revisión local no certifica
producción; usar los readbacks fechados al final. No iniciar workflows de GitHub,
Hosting, migraciones ajenas, cobros, correos ni una beta como consecuencia del plan.

**Estado de preparación, 23/10/2026:** el candidato incorpora la autorización por
archivo de los ocho consumidores del render y dos artefactos separados de Rules.
La partición revisada es **11 Functions de seguridad y 98 restantes**, conservando
las 109 identidades. Las lecturas remotas históricas se conservan abajo: no se
refrescaron al preparar estos artefactos. Los comandos son una propuesta para una
ventana futura autorizada, no una autorización ni una ejecución realizada.

**Resultado final del candidato:** consultar
[DRAFT_PROVIDER_AUTHORIZATION.md](../testing/DRAFT_PROVIDER_AUTHORIZATION.md).
La versión final aprobó 447/447 regresiones, lint sin errores, tres builds,
41/41 de ownership y discovery CLI de las tres codebases. La integración real
aislada aprobó 19/19; Storage base/candidato 312/312 cada uno y Firestore 160/160.
El informe distingue snapshots, hashes y límites. Conserva dos intentos previos
40/41 por timeout, sin aumentar sus límites ni presentarlos como aprobados.

Autoridades: [contrato de seguridad](../contracts/SECURITY_CONTRACT.md),
[ownership de Functions](../architecture/FUNCTIONS_CODEBASE_OWNERSHIP.md),
[evidencia de autorización](../testing/DRAFT_PROVIDER_AUTHORIZATION.md) y
[recorrido local](DEVELOPMENT_WORKFLOW.md). La decisión Q1 sobre administradores
sigue fuera de este cambio. Este procedimiento no cambia permisos por perfiles
editables ni define el futuro directorio público.

## Recursos y artefacto candidato

La lista completa y exacta está en
[DRAFT_PROVIDER_RUNTIME_TARGETS.json](../testing/DRAFT_PROVIDER_RUNTIME_TARGETS.json):
109 identidades locales, derivadas de `functions/functionOwnership.json` y ligadas
a su SHA-256. El registro no declara generación; hay que contrastarla con los
manifiestos SDK y el inventario remoto antes de operar. Cambiar runtime no autoriza
cambiar generación, región, nombre, codebase, triggers, IAM, límites o Secrets.

| Cambio | Recursos exactos | Alcance |
| --- | --- | --- |
| Firestore Rules | `deployment/render-asset-firestore/firestore.rules`; base `(default)` | Incluye los cierres previos del candidato canónico para proveedores y marker, y excluye `iconos`/`decoraciones` sólo de la escritura del fallback. Conserva sus lecturas. |
| Storage Rules | `deployment/storage-draft-provider/storage.rules`; bucket `reservaeldia-7a440.firebasestorage.app` | Desde la base remota exacta, cierra SDK de `borradores/**` y lectura pública SDK de fotos de proveedores; conserva las demás rutas remotas. |
| Seguridad de Functions | 11 `securityTargets`: 8 default y 3 payments, todas `us-central1` | Tres handlers de borradores y ocho consumidores del resolvedor; código de seguridad y runtime `nodejs22`. |
| Resto del runtime | 98 `runtimeOnlyTargets`: 95 default y 3 email; ninguno de payments | Completa Node 22 sin repetir los once targets centrales ni ampliar las 109 identidades. |

El helper `publishAssetNormalization` alcanza cinco exports de default
(`prepareDraftPreviewRender`, `validateDraftForPublication`, `publicarInvitacion`,
`retryPaidPublicationWithNewSlug`, `adminGetTemplateEditorDocumentV1`) y los tres
de payments (`createPublicationCheckoutSession`, `createPublicationPayment`,
`mercadoPagoWebhook`). Los ocho ya integran los once targets de seguridad del
JSON revisado. `prepareRenderPayload`, `renderAssetAuthorization`,
`renderAssetCatalogAccess` y el normalizador reciben/aplican contexto confiable
antes de reutilizar o resolver referencias. Los anclajes y cadenas del JSON
describen código local, no una revisión desplegada ni una prueba de IAM.

Actualizar un consumidor no actualiza los otros siete, aunque compartan un módulo
TypeScript. Tampoco detener checkout impide que sesiones de pago persistidas o
webhooks existentes alcancen la finalización anterior. No ampliar contención a
esos servicios ni invocarlos por deducción de este inventario.

El proyecto esperado es `reservaeldia-7a440`. La base `(default)` y el bucket
anterior fueron los destinos explícitos del inventario de lectura, y el bucket
coincide con `shared/firebaseEnvironment.cjs`. Las configs mínimas de los dos
artefactos fijan bucket o base de datos; `firebase.json` raíz se usa únicamente
para los selectores de Functions de este plan. Una resolución distinta bloquea el comando:
el inventario observado no sustituye la revalidación de la ventana.

Preparar un candidato inmutable que incluya los cambios autorizados, conserve
los cambios ajenos fuera del despliegue y vincule hashes de fuentes, Rules,
configuración, packages/locks y manifiestos con la evidencia final. No desplegar
una copia de emuladores: ésta sustituye `package.main`, bloquea handlers y contiene
configuración sintética. Tampoco usar `lib/` previo sin un build exitoso del mismo
candidato.

Los tres handlers se compilan desde `functions/src/index.ts`. El paquete debe
contener `drafts/templateDraftCreation.js`, `drafts/legacyHtmlDraft.js` y
`drafts/draftState.js`. `draftTrashLifecycle.ts` conserva sus exports y delega la
resolución de estado en `draftState.ts`; no son Functions independientes. Su
extracción requiere preservar pruebas de papelera/estado y discovery de todo
default. Payments y email mantienen sus entrypoints y builds existentes. La
etiqueta `runtimeOnlyTargets` indica prioridad fuera de las once correcciones,
no promete packages/imports idénticos byte por byte: conservar y verificar los
consumidores de la extracción compatible `draftState`.

## Preparación previa y requisitos de inicio

1. Verificar la correspondencia del candidato con la validación local cerrada en el informe:
   render, consumidores, compilación y ownership/discovery de las tres codebases.
   Conservar evidencias anteriores para fuentes sin cambios; no repetir suites
   aprobadas por rutina ni atribuirlas a inputs nuevos. Las matrices nuevas de
   Rules acreditan sus archivos exactos, no producción. Reabrir el control afectado
   si cambia su fuente. Node fijado: 22.23.4; CLI local fijada: 14.4.0. No CLI global ni
   `npx`, y no usar un `lib/` de otra revisión.
2. Fijar un candidato inmutable con la partición 11+98, los dos artefactos de
   Rules y los hashes/guards descritos abajo. Preservar Ads y cambios ajenos fuera
   de la selección. El futuro comando de Firestore debe usar su artefacto: el
   canónico raíz todavía permite escrituras de catálogo por el fallback.
3. Obtener autorización explícita del proyecto, ventana, once cambios de seguridad,
   98 actualizaciones restantes, contención de los tres servicios y modificación
   condicionada de los doce objetos. Este documento no concede esos permisos.
4. Usar el operador ya autorizado. Por decisión explícita posterior, A/B y los
   canarios autenticados quedan pendientes; no crear recursos sintéticos remotos
   en esta ventana. No crear usuarios, asignar claims, habilitar correos ni
   provocar cobros para preparar pruebas. No convertir runners demo en
   herramientas de producción.
5. Resolver explícitamente la transición de los ocho consumidores del render:
   aceptar por escrito la exposición parcial hasta actualizarlos y drenar sus
   revisiones anteriores, o preparar por separado contención adicional sustentada
   en IAM/configuración/efectos efectivamente leídos. El IAM observado sólo cubre
   los tres servicios de borradores; no autoriza ni demuestra cómo contener los
   otros ocho. Sin esa decisión, no iniciar la ventana.
6. Revalidar por lectura el estado necesario antes de operar: 109 identidades,
   generaciones, revisiones, runtimes, Rules, destino y permisos relevantes.
   Una deriva bloquea el recurso afectado; no aceptar eliminar/recrear recursos
   ni adaptar el registry o las bases de Rules para ocultarla. Los guards offline
   no sustituyen la procedencia confiable de la captura ni previenen una carrera
   posterior a ella.
7. Aceptar el impacto legacy: HTML histórico sin vínculo verificable queda cerrado
   —preview 404 y retry `failed-precondition`—, conservando datos y bytes; preview
   privado sin Bearer devuelve 401. Reconciliar históricos exige otra tarea
   autorizada; no introducir adopción automática para recuperar disponibilidad.

Contención efectiva, propagación, drenaje, canarios y readback de metadata son
**comprobaciones durante la ventana y posteriores**, no pruebas locales ni
resultados ya obtenidos. No hace falta desplegar para revisar esta propuesta.
Al cerrar la preparación local todavía no se había aplicado contención ni
ejecutado operaciones remotas; el registro final contiene la ejecución posterior.
CI del candidato queda como evidencia informativa pendiente,
según su sección; no se inventa un gate remoto obligatorio.

Google admite Node 22 para ambas generaciones; sus fechas publicadas son
deprecación 2027-04-30 y retiro 2027-10-31. Node 20 se deprecó 2026-04-30 y su
retiro está programado para 2026-10-30. Revalidar el
[calendario oficial](https://docs.cloud.google.com/functions/docs/runtime-support)
al ejecutar. El pin local no fija el patch de la imagen administrada de Google.

## Estado remoto efectivamente leído

Evidencia: `.local-isolation/remote-authorization-20261023/control-plane.json`.
Lecturas iniciales finalizadas a las 21:34:43 UTC; revisión adicional del ruleset
inmutable de Storage a las 21:40:31 UTC. No es una captura atómica.

| Recurso | Estado observado |
| --- | --- |
| Functions | 109/109 sin extras/faltantes; 103 default, 3 payments, 3 email; todas `us-central1` y **nodejs20**. 108 GEN_2; `onUserCreatedWelcomeEmail` GEN_1. La ausencia de etiqueta default es normal en CLI 14.4.0. |
| `copiarPlantilla` | Servicio `projects/reservaeldia-7a440/locations/us-central1/services/copiarplantilla`; revisión Ready `copiarplantilla-00544-xet`; generación de servicio 544; 100% LATEST; timeout 60 s. |
| `copiarPlantillaHTML` | Servicio `projects/reservaeldia-7a440/locations/us-central1/services/copiarplantillahtml`; revisión Ready `copiarplantillahtml-00496-voq`; generación 496; 100% LATEST; timeout 60 s. |
| `verInvitacion` | Servicio `projects/reservaeldia-7a440/locations/us-central1/services/verinvitacion`; revisión Ready `verinvitacion-00529-fox`; generación 529; 100% LATEST; timeout 60 s. |
| IAM | En los tres servicios: `roles/run.invoker → allUsers`, sin condición. Ningún grant público observado en proyecto; no parent informado. IAM de Function no reemplaza IAM de Cloud Run. `invokerIamDisabled` no fue emitido por la API; no se observó `true`. |
| Firestore | Ruleset `8fa0e2b6-8c36-4d10-9e83-87ebfb2c6e65`, release del 21/10/2026, igual a HEAD normalizado. SHA-256 `c72b8ac81af2e335c8441eda7907907be94ec414fabb63cf2fdd0e76b0f7d5da`. |
| Storage | Ruleset `cd354678-8198-4a0a-b651-0f8f8868e305`, release del 27/07/2026, distinto de HEAD/candidato. SHA-256 `bb8224303fd2ee57a00bceee1bde95d5c545b1785ada22b6d79b9af2930c492a`. |

La API de proyecto mostró identidades no públicas con roles de invocación,
administración Storage y firma; no se publicaron sus identidades. No se evaluaron
deny/PAB ni se eligió una identidad autorizada de canario. La ausencia de grants
públicos observados no acredita todos los permisos efectivos de cada cuenta.
Cloud Run [comprueba IAM por defecto](https://docs.cloud.google.com/run/docs/authenticating/public);
antes de contener debe volver a comprobarse la configuración efectiva y después
su denegación real, sin convertir una omisión del campo en una prueba de HTTP.

### Artefactos separados de Rules preparados y verificados localmente

El release remoto sólo separa iconos/decoraciones y proveedores; el fallback
concede read/write a autenticados para todo topLevel distinto de proveedores.
El canónico local agrega otras protecciones para imágenes/thumbnails,
`publicadas` y countdown que no forman parte del delta remoto de este plan.
Por eso se preparó [un artefacto Storage separado](../../deployment/storage-draft-provider/README.md).
`base.rules` se recuperó del blob Git
`f276a8952a3dfaa7e2f7370ae0be17cb6cd3f35d:storage.rules`: 2325 bytes idénticos al
hash remoto observado, sin una nueva consulta. Su delta se limita a:

1. Lectura de portada/galería de proveedores sólo por `isAdmin()`, retirando la
   referencia y helper `isPublicProvider` que las habilita públicamente.
2. `match /borradores/{allPaths=**} { allow read, write: if false; }` y exclusión
   `topLevel != "borradores"` en **ambos** grants del fallback. Sin la exclusión,
   el deny específico no protege por la suma de reglas coincidentes.
3. Mantener la exclusión remota de proveedores, reglas administrativas de
   escritura y restantes rutas sin cambios incidentales.

La base y el candidato aprobaron 312 casos SDK cada uno en
`.local-isolation/storage-release-GcuXfr` y `storage-release-UPQoR2`, con fuentes
exactas, TAP y limpieza. Cambiaron sólo 48 permisos autenticados de borradores y
12 lecturas/listados de proveedores; las 128 operaciones de otras rutas conservaron
su resultado. Esto caracteriza permisos remotos heredados, no los legitima.

El [artefacto Firestore](../../deployment/render-asset-firestore/README.md) parte
de una copia exacta del canónico **local**, conservada en su `base.rules`, no de
una nueva lectura remota. Incluye sus cierres previos
de proveedores y `borradores.draftCreation`; además divide read/write del fallback
y agrega `iconos`/`decoraciones` sólo a la exclusión de escritura. Conserva el
predicado de lectura byte por byte, incluidas las consultas del editor ordinario
y las lecturas autenticadas de descendientes. Las escrituras raíz requieren
claims administrativos existentes; las de descendientes quedan denegadas.
Sus 160 casos SDK aprobaron en `.local-isolation/storage-release-kG9MHM`.

| Artefacto | SHA-256 de base | SHA-256 del candidato | SHA-256 de config mínima |
| --- | --- | --- | --- |
| Storage | `bb8224303fd2ee57a00bceee1bde95d5c545b1785ada22b6d79b9af2930c492a` | `40ed3e455aa8ee2510744a25ca968e912f0fb3fe43c28c34f99bf0d590daca80` | `346fc6d5d2de79776329883ca8ea8b6dcf7a7fff0104dde86ddb84e656ae2867` |
| Firestore | `700e0117fab33ccac394311907976fca5f0334b0b05d92adf709de7f0c12d1f0` — canónico local | `7c6ad315deaa372f6c5d416e89593024480858a32ab1e46e9705411d44eb386c` | `ee887975bbca8bff8ac0bb895ab8ecbda78e7206e2706ba3ccf204219ce7a56f` |

Los `manifest.json` de ambos directorios fijan procedencia, tamaños y hashes.
Los guards `scripts/local/storageReleaseArtifact.mjs` y
`scripts/local/firestoreAssetReleaseArtifact.mjs` verifican derivación y config
mínima. Los cuatro archivos de cada artefacto tienen atributos Git `-text` por
nombre exacto para conservar los bytes hasheados. Storage exige además evidencia
confiable de release/base de hasta
15 minutos; la captura histórica no sirve como captura fresca. Firestore deriva
del snapshot exacto y compara el canónico permitiendo únicamente CRLF frente a
LF; otros cambios siguen bloqueados. No certifica el estado remoto. No editar timestamps para pasar
el control ni tratar un JSON como prueba autenticada por sí mismo.

**Los canónicos raíz permanecen intactos.** Un deploy posterior de
`firestore.rules` mediante `firebase.json` raíz reabriría las escrituras del
fallback de `iconos`/`decoraciones` y volvería a permitir falsificar la autoridad
del catálogo que usa el render. No usarlo como rollback ni desplegarlo después
sin integrar/revisar previamente este cierre en su autoridad canónica. Tampoco
usar el Storage canónico completo como sustituto incidental del artefacto
acotado. No se presentan las protecciones locales adicionales como desplegadas.

## Revalidación de sólo lectura antes de la ventana

Capturar el estado anterior y repetirlo después de cada tramo. Guardar evidencia
privada fuera de Git; el informe compartible sólo contiene identidades técnicas,
hashes, conteos y diferencias sanitizadas. No registrar tokens, Secrets, variables
de entorno por valor, HTML, fotos, contenido de perfiles ni datos personales.

Se ejecutó el lector acotado `scripts/auditRemoteAuthorization.mjs`; conserva
checkpoints y proyecciones. Para una nueva captura previa a la ventana usar un
directorio nuevo bajo `.local-isolation`, pues reutilizar el anterior reutiliza
sus lecturas. El siguiente comando CLI alternativo sigue **no ejecutado** y su
salida completa requeriría revisión privada:

```powershell
node scripts/local/tools/node_modules/firebase-tools/lib/bin/firebase.js functions:list --project reservaeldia-7a440 --config firebase.json --json --non-interactive
```

Este listado no basta para IAM, revisiones o reglas. Obtener también, mediante
las APIs/CLI o consola oficiales autorizadas:

- Las 109 Functions por nombre/región: existencia, estado, generación, runtime,
  entrypoint, codebase, configuración operativa y referencias de bindings por
  nombre. Comparar explícitamente los once targets de seguridad y los 98 restantes.
- Para cada uno de los tres endpoints, el servicio Cloud Run que indique su
  descriptor real, URLs de invocación, revisiones, reparto de tráfico y políticas
  IAM efectivas, incluidos grants heredados. No deducir el servicio sólo del nombre
  de la Function ni tomar `ACTIVE` como prueba de drenaje de solicitudes viejas.
- Versiones/releases efectivos de Firestore y Storage Rules, sus hashes y la
  base/bucket de destino. No inferir reglas desplegadas desde archivos locales.
- IAM del bucket y ACL/default ACL conservan la evidencia histórica del inventario;
  refrescar sólo lo necesario para una operación aprobada o una deriva concreta.
  Revalidar los doce objetos propuestos mediante metadata y precondiciones.
  Rules no revocan URLs con token, ACL públicas
  ni copias/cache ya distribuidas. `cacheControl: private,no-store` tampoco es una
  ACL; `legacyHtmlDraft.ts` evita copiar metadata/tokens de la plantilla, pero no
  corrige una concesión pública del bucket.
- Conservar los conteos, vínculos y límites del inventario paginado ya completado;
  no repetirlo entero por rutina. Si una deriva exige ampliarlo, delimitar esa
  lectura antes de operar. Las Rules no certifican retrospectivamente datos que
  antes podían modificarse. No descargar contenido ni reconciliar registros.

Un inventario anterior, si existe, conserva su fecha y límites: no sustituye esta
comprobación previa. Ante una vía pública por IAM/ACL/tokens, preparar y autorizar
su remediación separada; publicar Rules no permite declarar privacidad completa.

## Contención y secuencia de despliegue

La contención pendiente debe cerrar las invocaciones de `verInvitacion`,
`copiarPlantilla` y `copiarPlantillaHTML` en el servidor, cubrir sus URLs efectivas
y considerar grants heredados. Definir la operación exacta con el inventario IAM;
no dar por suficiente ocultar controles de UI. Con el estado observado, la
operación propuesta es GET de IAM v3 de cada uno de los **tres servicios exactos**
de la tabla, eliminar exclusivamente `allUsers` de `roles/run.invoker`, y
`setIamPolicy` con **etag recién leído** y todos los restantes bindings intactos.
Una condición, grant nuevo, IAM-check deshabilitado, parent nuevo o etag distinto
detiene la operación para revisión; no sobreescribir a ciegas ni agregar grants
para hacer funcionar un canario. Esta operación está propuesta, no ejecutada.
Esperar
y comprobar el drenaje del código anterior antes de reabrir. No borrar Functions.

El IAM de los otros ocho consumidores **no fue auditado con ese alcance**.
Antes de autorizar la ventana se debe aceptar expresamente la transición
parcialmente expuesta hasta actualizarlos y drenar sus revisiones anteriores,
o preparar por separado contención adicional con lecturas, permisos y efectos
revisados. No deducir cambios IAM, pausas de pagos/webhooks ni cierre de sesiones
a partir de sus nombres. La propuesta actual sólo contempla contención de los
tres servicios observados; su aprobación debe identificar la decisión sobre los
ocho restantes.

La contención elegida debe persistir durante cada actualización. Antes de iniciar,
revisar el manifiesto SDK efectivo y el comportamiento de la CLI fijada; después
de cada despliegue comprobar nuevamente IAM efectivo, URLs y tráfico. La CLI
14.4.0 concede invocación pública por defecto al crear un HTTPS/callable: cualquier
propuesta de creación o recreación bloquea esta secuencia. En actualizaciones
HTTPS, `invoker: null` o un valor explícito puede modificar la política. Los tres
handlers locales no declaran `invoker`; esto no prueba que la contención remota
persista. La comprobación es un prerrequisito operativo, no una reapertura
automática demostrada para este candidato.

**Sin contención efectiva de los tres y decisión explícita sobre los ocho, no
iniciar esta propuesta.** Rules no frenan al Admin SDK viejo y actualizar un
módulo compartido en una Function no actualiza las demás revisiones desplegadas.
Incluso una orden CLI con varios recursos no hace atómica su actualización.

Los siguientes son comandos para una ventana futura autorizada, desde la raíz
del candidato y con Node fijado seleccionado. **No ejecutarlos durante la
preparación.** `--project` evita depender del proyecto activo; `--config` y los
selectores evitan agregar Hosting, índices u otros recursos. No usar `--force`.
Mantener los predeploy originales: sus builds/readiness no sustituyen los gates
anteriores ni certifican estado remoto.

**Paso 1 — Storage Rules.** Confirmar el destino y la versión efectiva tras la
respuesta CLI; realizar las comprobaciones de denegación autorizadas.

En la ventana, obtener una captura nueva de origen confiable en
`.local-isolation/predeployment-authorization/control-plane.json`; ese es el
destino propuesto para la captura futura, no un archivo creado aquí. El guard
exige su antigüedad máxima de 15 minutos, base/release/hash y config. Si falta,
está vencida o cambió, detener; no reescribir la evidencia histórica.

```powershell
node scripts/local/storageReleaseArtifact.mjs --evidence .local-isolation/predeployment-authorization/control-plane.json
node scripts/local/tools/node_modules/firebase-tools/lib/bin/firebase.js deploy --project reservaeldia-7a440 --config deployment/storage-draft-provider/firebase.json --only storage --non-interactive
```

El guard es un paso obligatorio del procedimiento: la CLI no lo ejecuta
automáticamente ni lo convierte en precondición atómica. Confirmar después el
release/hash/bucket y las denegaciones efectivas autorizadas.

**Paso 2 — Firestore del candidato.** Revisar contra el release remoto fresco
todo el delta: cierres previos de proveedor/marker y protección de escritura del
catálogo. El guard deriva del snapshot local exacto y comprueba deriva del
canónico salvo CRLF/LF, sin hacer esa lectura remota.
Confirmar release efectivo, marker protegido y escritura ordinaria del catálogo
denegada, conservando sus lecturas, antes de actualizar los handlers.

```powershell
node scripts/local/firestoreAssetReleaseArtifact.mjs
node scripts/local/tools/node_modules/firebase-tools/lib/bin/firebase.js deploy --project reservaeldia-7a440 --config deployment/render-asset-firestore/firebase.json --only "firestore:(default),firestore:rules" --non-interactive
```

**Paso 3 — Preview privado.** Confirmar actualización y pruebas correspondientes
antes del siguiente comando.

```powershell
node scripts/local/tools/node_modules/firebase-tools/lib/bin/firebase.js deploy --project reservaeldia-7a440 --config firebase.json --only functions:default:verInvitacion --non-interactive
```

**Paso 4 — Creadores con precondiciones.** Se ejecutan y verifican separadamente;
el fallo de uno no se considera compensado por el éxito del otro.

```powershell
node scripts/local/tools/node_modules/firebase-tools/lib/bin/firebase.js deploy --project reservaeldia-7a440 --config firebase.json --only functions:default:copiarPlantilla --non-interactive
node scripts/local/tools/node_modules/firebase-tools/lib/bin/firebase.js deploy --project reservaeldia-7a440 --config firebase.json --only functions:default:copiarPlantillaHTML --non-interactive
```

**Paso 5 — Ocho consumidores de assets.** Usar individualmente los selectores
4–11 de la tabla con la misma CLI local, `--project reservaeldia-7a440`,
`--config firebase.json`, `deploy --only` y `--non-interactive` del paso anterior.
La lista enumera **los once targets de seguridad completos** en orden operativo;
coincide como conjunto con `securityTargets` del JSON, sin añadir exports.

| Orden | Selector exacto | Prioridad |
| --- | --- | --- |
| 1 | `functions:default:verInvitacion` | Entrega privada legacy. |
| 2 | `functions:default:copiarPlantilla` | Copia moderna con reserva/propiedad. |
| 3 | `functions:default:copiarPlantillaHTML` | Copia HTML con vínculo/precondición de objeto. |
| 4 | `functions:default:prepareDraftPreviewRender` | Preview moderno con autorización por archivo. |
| 5 | `functions:default:validateDraftForPublication` | Validación anterior a publicación. |
| 6 | `functions:default:publicarInvitacion` | Finalización de sesión aprobada. |
| 7 | `functions:default:retryPaidPublicationWithNewSlug` | Finalización/reintento de pago persistido. |
| 8 | `functions:payments:mercadoPagoWebhook` | Procesamiento de pagos/sesiones persistidos; no enviar webhooks reales de prueba. |
| 9 | `functions:payments:createPublicationPayment` | Ruta de pago que también alcanza finalización; no invocar cobros como smoke test. |
| 10 | `functions:payments:createPublicationCheckoutSession` | Preparación de nuevas sesiones. |
| 11 | `functions:default:adminGetTemplateEditorDocumentV1` | Preview editorial de plantilla con contexto administrativo. |

Primero preview/validación, después finalización y rutas de pagos persistidos,
luego checkout/plantilla. Detener nuevas sesiones por sí solo no evita que una
sesión existente o webhook alcance código viejo. El rollout no cambia IAM,
activación de pagos/correos ni configuración de negocio de esos ocho; cualquier
contención adicional necesita preparación y aprobación específica. No invocar
pagos ni webhooks reales para comprobar arranque.

**Paso 6 — Doce objetos y canarios.** Aplicar sólo la remediación condicionada
de metadata del apartado de tokens. Completar comprobaciones de las dos capas,
versiones efectivas y drenaje de los once handlers. Sólo entonces evaluar la
reapertura de los tres servicios contenidos, con la autorización correspondiente
y canarios aprobados. No declarar cierre por haber actualizado Rules o tres
handlers: faltan los ocho consumidores, su drenaje, los doce targets y canarios.
Revalidar denegaciones antes y después de reabrir. Las limitaciones sobre URLs
firmadas y copias históricas permanecen; ningún éxito local/CLI las elimina.

| Estado intermedio | Protección ya disponible | Riesgo que permanece |
| --- | --- | --- |
| Storage actualizado | SDK no accede a artifacts de borradores ni fotos públicas de proveedores | Firestore puede seguir con reglas anteriores; Admin/HTTP viejos no obedecen Storage Rules. |
| Ambos artefactos Rules actualizados | Marker/proveedores protegidos y catálogo sin escritura ordinaria | Writers y resolvedores Admin viejos siguen fuera de Rules; no se revocan URLs ya emitidas. |
| Preview actualizado | Nuevo lector exige dueño y vínculo/hash | Cualquier escritor anterior o invocación vieja pendiente conserva el defecto de escritura. |
| Tres handlers actualizados | Nuevas solicitudes usan precondiciones y entrega privada | Ocho consumidores todavía pendientes/parciales; comprobar contención y drenaje de los tres. |
| Ocho consumidores en transición | Cada consumidor actualizado aplica la política nueva | Los demás y sus invocaciones anteriores conservan el comportamiento previo; transición expresamente aceptada o contenida por preparación adicional. |
| Once handlers actualizados | Código de seguridad y Node 22 en esos targets | Faltan drenaje, propagación, doce tokens y canarios; 98 targets todavía requieren completar runtime. |
| Cierre de seguridad observado | Rules/once handlers/tokens/canarios verificados dentro de sus límites | Completar las 98 actualizaciones y el inventario final; no prometer retirar URLs firmadas/copias distribuidas sin evidencia. |

## Completar el runtime de las otras 98 Functions

**Paso 7.** Usar los 98 `runtimeOnlyTargets` del
[artefacto exacto](../testing/DRAFT_PROVIDER_RUNTIME_TARGETS.json): 95 default y
3 email, ninguno de payments. Sus tres targets ya integran seguridad. Validar
lotes de hasta diez, sin repetir los once anteriores ni cambiar generaciones,
entrypoints, codebases, Secrets o activaciones. La etiqueta runtime describe
la partición operativa: verificar también los consumidores de código compartido
compatible. Desplegar código no autoriza cobros ni envíos de correo.

Este bloque **sólo comprueba el artefacto y muestra comandos**; no se ejecutó al
actualizar el documento. No ejecuta CLI, no escribe archivos ni usa
`Invoke-Expression`. Revisar los selectores impresos y
aprobar su ejecución por lote posteriormente. Todos incluyen CLI local, proyecto
y configuración explícitos.

```powershell
$runtimeTargets = Get-Content -LiteralPath docs/testing/DRAFT_PROVIDER_RUNTIME_TARGETS.json -Raw | ConvertFrom-Json
$registryDigest = (Get-FileHash -LiteralPath functions/functionOwnership.json -Algorithm SHA256).Hash.ToLowerInvariant()
if ($registryDigest -ne $runtimeTargets.registry.sha256) { throw 'El registro cambió: regenerar y revisar el inventario.' }
if ($runtimeTargets.counts.all -ne 109 -or $runtimeTargets.counts.security -ne 11 -or $runtimeTargets.counts.runtimeOnly -ne 98 -or $runtimeTargets.securityTargets.Count -ne 11 -or $runtimeTargets.runtimeOnlyTargets.Count -ne 98) { throw 'Alcance inesperado.' }
$canonicalRegistry = Get-Content -LiteralPath functions/functionOwnership.json -Raw | ConvertFrom-Json
$canonicalIds = @($canonicalRegistry.endpoints | ForEach-Object {
  if ($_.regions.Count -ne 1) { throw 'Revisar endpoint con múltiples regiones.' }
  '{0}/{1}/{2}' -f $_.codebase, $_.name, $_.regions[0]
})
$combinedTargets = @($runtimeTargets.securityTargets) + @($runtimeTargets.runtimeOnlyTargets)
$artifactIds = @($combinedTargets | ForEach-Object { '{0}/{1}/{2}' -f $_.codebase, $_.name, $_.region })
if (@($artifactIds | Select-Object -Unique).Count -ne 109 -or @(Compare-Object $canonicalIds $artifactIds -CaseSensitive).Count -ne 0) { throw 'El artefacto no coincide con el registro.' }
$expectedSecurity = @(
  'default/verInvitacion/us-central1', 'default/copiarPlantilla/us-central1', 'default/copiarPlantillaHTML/us-central1',
  'default/prepareDraftPreviewRender/us-central1', 'default/validateDraftForPublication/us-central1',
  'default/publicarInvitacion/us-central1', 'default/retryPaidPublicationWithNewSlug/us-central1',
  'payments/mercadoPagoWebhook/us-central1', 'payments/createPublicationPayment/us-central1',
  'payments/createPublicationCheckoutSession/us-central1', 'default/adminGetTemplateEditorDocumentV1/us-central1'
)
$actualSecurity = @($runtimeTargets.securityTargets | ForEach-Object { '{0}/{1}/{2}' -f $_.codebase, $_.name, $_.region })
if (@(Compare-Object $expectedSecurity $actualSecurity -CaseSensitive).Count -ne 0) { throw 'Cambió la partición de seguridad.' }
if (@($runtimeTargets.runtimeOnlyTargets | Where-Object { $_.codebase -eq 'payments' }).Count -ne 0) { throw 'Payments ya pertenece al tramo de seguridad.' }
foreach ($codebaseName in @('default', 'email')) {
  $batchTargets = @($runtimeTargets.runtimeOnlyTargets | Where-Object { $_.codebase -eq $codebaseName } | Sort-Object name)
  $expectedCount = if ($codebaseName -eq 'default') { 95 } else { 3 }
  if ($batchTargets.Count -ne $expectedCount) { throw 'Partición inesperada.' }
  for ($offset = 0; $offset -lt $batchTargets.Count; $offset += 10) {
    $selectedTargets = @($batchTargets | Select-Object -Skip $offset -First 10)
    if (@($selectedTargets | Where-Object { $_.region -ne 'us-central1' -or $_.name -notmatch '^[A-Za-z][A-Za-z0-9_]*$' }).Count -ne 0) { throw 'Identidad inesperada.' }
    $selectors = ($selectedTargets | ForEach-Object { 'functions:{0}:{1}' -f $_.codebase, $_.name }) -join ','
    'node scripts/local/tools/node_modules/firebase-tools/lib/bin/firebase.js deploy --project reservaeldia-7a440 --config firebase.json --only {0} --non-interactive' -f $selectors
  }
}
```

No usar `scripts/deployFunctionsBatched.cjs` para este plan: carga solamente
`functions/lib/index.js`, elimina `predeploy` y produce selectores sin codebase.
No cubre los dos paquetes separados ni conserva los gates previstos. Tampoco
usar `deploy:full`, `deploy:hosting`, workflows de Hosting o las configuraciones
`firebase.payments-rollback.json` / `firebase.email-rollback.json`: estas últimas
sirven para ownership histórico, no para revertir esta seguridad.

## Canarios, señales de parada y recuperación

**Alcance reducido aprobado para esta ventana:** las instrucciones A/B siguientes
conservan la especificación de canarios autenticados, pero su ejecución queda
pendiente por decisión del usuario. No bloquean la secuencia actual ni se
presentan como aprobados. Se conservan los controles de despliegue, IAM,
revisiones/tráfico/drenaje y metadata; tras reabrir cada servicio, comprobar el
rechazo anónimo sin escribir datos ni solicitar contenido privado.

Durante la contención, usar una identidad de invocación **ya autorizada** y
cuentas Firebase sintéticas A/B preexistentes. El transporte propuesto usa
`X-Serverless-Authorization` para el ID token de Cloud Run con audience del
servicio real, y `Authorization` para el ID token Firebase de A/B; Cloud Run
[documenta esa separación](https://docs.cloud.google.com/run/docs/authenticating/service-to-service).
No se generaron esos tokens, no se eligió identidad ni se invocaron servicios en
esta auditoría. Confirmar compatibilidad callable/HTTP en el canario autorizado;
un fallo IAM no prueba una denegación del handler. La prueba anónima del handler
retiene la cabecera IAM del operador y omite únicamente Firebase Auth.

Los 60 s observados son el timeout configurado, **no evidencia de drenaje**.
Comprobar propagación de la contención, ausencia de nuevas invocaciones a las
revisiones viejas y finalización de las anteriores mediante métricas/evidencia
saneada; no decidir reapertura sólo por reloj o estado ACTIVE.

Los canarios se ejecutan únicamente tras permiso específico, con dos cuentas
sintéticas controladas A/B preexistentes y sin contenido real. No registrar usuarios
remotos para obtener esas cuentas: un alta Auth puede activar correos de bienvenida
o notificaciones internas. Si no existen cuentas aptas, su preparación y efectos
requieren un permiso separado; hasta entonces el canario está pendiente. Registrar
resultado/status y hashes, no credenciales ni cuerpos privados. Limpiar sólo
identificadores inventariados del canario; no usar borrados amplios por prefijo.

| Comprobación posterior | Resultado requerido |
| --- | --- |
| Proveedores documentos/fotos: visitante, A, B y perfil editable que dice admin | SDK denegado aunque el proveedor tenga publicado/activo/visible; el administrador legítimo conserva el contrato actual. |
| `borradores/**` por Storage SDK | Lectura/listado/escritura denegados incluso al dueño y al admin; probar prefijos exactos y descendientes. |
| Marker Firestore | No se puede crear, agregar, modificar ni borrar por SDK; edición normal propia preservándolo funciona. B no accede a A. |
| Autoridad del catálogo | A/B/perfil forjado no pueden crear/modificar/borrar `iconos` o `decoraciones`; admin conserva escritura raíz. Lecturas autenticadas del editor y descendientes se conservan; escrituras descendientes denegadas. |
| Autorización de assets en los ocho consumidores | A→B denegado antes de metadata/reuse/firma/fallback, A→A y referencias permitidas funcionan; comprobar las ocho revisiones y drenaje. Pagos/webhooks se validan en aislamiento, con observación del rollout; no invocarlos realmente como smoke test ni crear cobros para fabricar canarios. |
| Copias | A crea una vez; retries y carreras no cambian dueño/contenido; B, plantilla/modo incompatible y colisiones fallan sin sobrescribir. |
| HTML | Reserva incompleta se reintenta sobre la fuente fijada; huérfano o histórico sin vínculo queda cerrado y conservado. No modificar datos reales para probarlo. |
| Preview | Sin Bearer/query token: 401; cuenta B: 403; dueño válido: respuesta privada; fixture histórico no vinculado/objeto alterado: denegación. Revocación/deshabilitación conserva evidencia del emulador; sólo usar fixtures remotos ya existentes si se autoriza, sin modificar usuarios/claims para fabricar el caso. |
| Compatibilidad | Registro/recuperación completos se prueban en aislamiento con correos deshabilitados. En remoto, login con cuentas de control preexistentes, creación Konva propia, edición y accesos existentes funcionan. La entrega publicada `/i` conserva su contrato con un recurso sintético aprobado; no ejecutar checkout/cobros para prepararlo. |
| Runtime | Inventario final coincide con las 109 identidades y `nodejs22`, sin cambio de generación, pérdida de endpoint o opciones inesperadas. Comprobar arranque y recorridos representativos de render/dependencias nativas; discovery sólo no demuestra ejecución completa. |

Detener la secuencia y conservar la contención ante: diferencias de proyecto,
región/generación/ownership; propuestas de eliminar/recrear recursos; fallo de
predeploy/build/discovery; errores de arranque/runtime; canarios que permitan acceso
ajeno o alteren contenido en retry; falta de evidencia sobre reglas/tráfico;
incrementos anómalos de 401/403/404/5xx o fallos del flujo propio. No reiniciar
lotes automáticamente ni continuar por el mero hecho de que una parte pasó.

La recuperación es una revisión correctiva hacia adelante o un artefacto seguro
preparado y probado previamente. Conservar las Rules nuevas, autorización del
lector, marker reservado y precondiciones de ambos escritores. Si no puede
restablecerse disponibilidad con esas garantías, mantener cerrado el endpoint
afectado mientras se corrige. No volver al handler público ni a escrituras `.set`
sin protección; no restaurar Rules vulnerables, relajar el marker o adoptar/borrar
huérfanos para destrabar un intento.

No usar los canónicos raíz actuales como rollback de los artefactos separados:
Firestore reabriría la escritura del catálogo y la base antigua de Storage
reabriría accesos corregidos. Mantener ambos cierres y la autorización por archivo
en todas las revisiones de recuperación; integrar cualquier actualización canónica
posterior sólo tras revisar su delta y consumidores.

Conservar datos, reservas incompletas y evidencia para recuperación explícita.
No prometer que una fuente histórica eliminada puede reconstruirse: el retry
depende de su generación fijada. Para un fallo del runtime, preparar una revisión
compatible con Node 22; Node 20 próximo a retiro no es una estrategia sostenible.
Una reversión de Hosting, si llegara a existir en otra tarea, no revierte Rules
ni Functions y no debe usarse como señal de que este despliegue se deshizo.

Al cerrar una ventana autorizada, registrar qué recursos se actualizaron, cuáles
quedan pendientes, hashes/versions efectivos, resultados de canarios, estado de
contención y riesgos residuales. No declarar privacidad de objetos históricos ni
migración total de runtime mientras falte evidencia de esos canales y recursos.

## CI remota sin efectos de despliegue: procedimiento pendiente

La [ejecución 39966214974](https://github.com/ataberner/reservaeldia/actions/runs/39966214974)
aprobó el SHA base `5ff9bb85` y desplegó Hosting antes de esta auditoría. Usa
Node 20.19.5 en el gate de verificación; no valida el candidato local Node
22.23.4. El reusable sólo acepta
`workflow_call`; sus callers actuales despliegan Hosting por push a main o PR
interno. No se inició, reintentó ni despachó workflow alguno.

Para obtener evidencia remota nueva se requiere publicar fuentes; no existe
un dispatch aislado que alcance este árbol sin commit. Procedimiento exacto
propuesto, **requiere autorización para el push y no se ejecutó**:

1. Fijar candidato inmutable con manifiesto de archivos seleccionados. Excluir
   trabajo ajeno de publicidad/cachés/evidencia privada, conservándolo en el
   workspace. Si esa separación cambia inputs probados, validar el artefacto
   resultante; no usar automáticamente los hashes de otra selección.
2. Verificar por GET que `ci/provider-auth-readiness-20261023` no existe ni tiene
   PR; revisar todos los workflows de main y del candidato, incluidos
   `workflow_run`/`pull_request_target`. Cualquier trigger nuevo exige revisión.
3. Añadir sólo en esa rama `.github/workflows/candidate-verification.yml`:

   ```yaml
   name: Candidate verification only
   on:
     push:
       branches: [ci/provider-auth-readiness-20261023]
   permissions:
     contents: read
   jobs:
     verification:
       uses: ./.github/workflows/local-verification.yml
   ```

   Sin `secrets: inherit`, credenciales Firebase ni jobs posteriores. El reusable
   del mismo SHA conserva entorno demo, copia desechable, guardas y evidencia
   sintética. Revisar su wiring y controles estructurales antes de publicar.
4. Publicar únicamente el SHA inmutable seleccionado a
   `refs/heads/ci/provider-auth-readiness-20261023`, sin force, PR, merge ni main.
   El comando concreto de push se revisa cuando exista ese SHA; no inventarlo ni
   usar HEAD móvil. El propio push iniciaría la verificación y no está autorizado
   como parte de esta preparación.
5. Consultar runs/jobs del SHA exacto, exigir únicamente el workflow previsto,
   etapas completas, limpieza y manifiesto correspondiente. No reejecutar el run
   histórico. `verify:local` no incluye `release`; para evidencia remota adicional
   de build/editor se necesita otro job aislado del mismo SHA con
   `npm run verify:release:local`, no un job de Hosting.

El gate `needs: verification` es requisito de los workflows de Hosting observados;
no se inventa una exigencia de CI remota para el deploy selectivo. Queda evidencia
de Ubuntu/Java 21 pendiente; el gate local mantiene su alcance. Los permisos de
push no se comprobaron y no se solicitan grants como parte de este procedimiento.

## Propuesta única de esta revisión y condiciones de aprobación

La propuesta es **Storage acotado → Firestore del artefacto → lector privado →
dos creadores → ocho consumidores del render → doce objetos/canarios/drenaje →
98 targets restantes**, con contención de los tres servicios observados y decisión
explícita sobre la transición de los ocho. Los cambios técnicos están preparados
localmente; su estado final de validación queda en el informe principal. Preparar
el candidato no autoriza desplegar, alterar IAM, revocar tokens ni operar pagos.

| Pendiente | Evidencia | ¿Bloquea? | Acción exacta |
| --- | --- | --- | --- |
| Autorización por archivo y once targets | Política/contexto y aliases implementados; 447/447, tres builds, ownership 41/41 y tres discoveries PASS; JSON 11+98 con anclajes | **Bloqueo local resuelto.** No acredita producción | Seleccionar el candidato exacto vinculado a los hashes del informe. Revalidar sólo controles afectados por cambios posteriores; preservar los intentos previos fallidos y no ejecutar pagos para reproducir. |
| Artefactos Rules separados | Storage base+candidato 312+312 SDK PASS; Firestore catálogo 160 SDK PASS; manifests y guards exactos | **Preparación local realizada.** Revalidación de base/destino necesaria antes de operar | Usar sólo las configs separadas y guardar evidencia fresca confiable. Firestore incluye los cierres previos del canónico más write catálogo; no desplegar después el canónico actual que reabre ese fallback. |
| Identidades/runtime/reglas/IAM | 109/109, Node 20; releases e IAM leídos | **Resuelto como diagnóstico.** Revalidación necesaria en la ventana | Refrescar sólo estado necesario, comprobar las mismas identidades y ausencia de deriva; detener ante diferencias. Retiro de Node 20 programado según el calendario citado para el 30/10/2026: completar las 109 actualizaciones, sin cambiar generación. |
| Transición de los ocho consumidores | El usuario aceptó expresamente la exposición parcial hasta rollout/drenaje y exige mantener pagos/webhooks habilitados | **Decisión resuelta para esta ejecución** | Aplicar el orden documentado, verificar revisiones/drenaje y conservar IAM de esos ocho. No agregar pausas ni pruebas de cobros. |
| Tokens de archivos privados | Doce objetos actuales con metadata de token; inventario y correlación detallados en el informe | **No exige revocarlos antes de autorizar. Sí integra el despliegue aprobado y su cierre de privacidad** | Revisar los doce targets del manifiesto privado; aplicar exclusivamente la modificación condicionada de metadata del apartado siguiente. No cambiar bucket IAM, ACL, UBLA o PAP por ausencia de evidencia de grants públicos. |
| URLs firmadas, cachés y consumo fuera de proyección | No se consultaron logs/cuerpos privados; metadata no enumera URLs firmadas emitidas | **Límite de evidencia, no prueba de exposición nueva ni bloqueo genérico** | Conservar el límite en la aprobación; ante una referencia concreta adicional, revisar su recurso y tratamiento por separado. No descargar contenido para fabricar una prueba ni prometer retirar copias distribuidas. |
| CI del candidato | Run disponible acredita SHA base; no hay entrada aislada del árbol local | **No es gate remoto obligatorio comprobado. Evidencia pendiente** | Si se quiere evidencia Ubuntu/Java 21, autorizar publicación del SHA en la rama aislada y ejecutar el procedimiento anterior. No main, PR ni rerun de Hosting. |
| Operador y manifiesto de canarios | Operador ADC identificado; usuario confirmó continuar dejando A/B pendiente | **No bloquea esta ventana; limitación de evidencia aceptada** | Omitir canarios autenticados y recursos sintéticos. Conservar evidencia local y no afirmar aislamiento autenticado revalidado en producción. No crear Auth users ni cambiar claims. |
| Carpeta operativa del candidato | Snapshot 389 archivos fijado y carpeta separada materializada con overlay privado | **Preparación realizada para la ejecución en curso** | Verificar hashes antes de cada operación y mantener predeploy originales; Email requiere overlay por endpoint para conservar valores efectivos. No aceptar defaults ni cambios de configuración ajenos. |
| Propagación, drenaje, Node 22 efectivo y resultados HTTP/SDK | Pruebas locales y captura histórica del control-plane; ninguna modificación remota realizada | **Comprobaciones de la ventana y posteriores**, no lecturas que puedan acreditarse ahora | Tras cada tramo confirmar release/revisión/tráfico, denegaciones efectivas y canarios. Mantener cierre si falla un control; no restaurar permisos vulnerables. |

Una vez resueltos los requisitos previos y autorizado el candidato exacto, la
ventana propuesta comprende únicamente:

1. **Contención temporal de los tres servicios identificados**, con política
   etag y operador aprobados; comprobar denegación en sus URLs efectivas y drenaje.
   No extender IAM/pausas a pagos por deducción de este procedimiento.
2. **Storage acotado → Firestore del artefacto → `verInvitacion` → ambos creadores**,
   con los selectores del tramo inicial. Conservar los paquetes originales y
   predeploy, sin Hosting, índices, Secrets ni configuración de negocio.
3. **Los ocho callers en el orden de selectores 4–11**: preview/validación,
   finalización y pagos persistidos, checkout/plantilla. La transición no es
   atómica: los todavía antiguos y sus invocaciones conservan el comportamiento
   previo. No invocar pagos/webhooks ni crear operaciones reales como smoke tests.
   Su activación/IAM no cambia; la decisión previa sobre exposición/contención
   adicional debe estar documentada.
4. **Retirar la metadata de token de los doce recursos identificados**, con
   precondiciones frescas y observación posterior. Sin eliminación/recreación de
   archivos, cambios de ACL o reparación supuesta de documentos.
5. **Verificación remota reducida aprobada:** A/B y canarios autenticados de las
   dos capas quedan pendientes, con sus pruebas locales conservadas. Reabrir
   invocación de los tres servicios sólo con handlers seguros, revisiones y
   drenaje comprobados; verificar inmediatamente el rechazo anónimo y detener
   ante un fallo. No crear fixtures ni ejecutar cobros/comunicaciones de prueba.
   El transporte público con autorización dentro del handler no es restaurar
   el handler vulnerable. La retirada de tokens no se revierte.
6. **Los 98 targets restantes del JSON confirmado**, 95 default y 3 email, en
   lotes de hasta diez sin repetir los once de seguridad. No hay lote payments
   restante. Inventario final Node 22, generaciones intactas y resultados/límites
   registrados. Una deriva funcional o de identidad requiere revisar la propuesta.

Los gates locales del candidato están cerrados. La transición, selección
inmutable, operador y autorización se resolvieron para la ventana en curso;
A/B quedó diferido por el usuario. Las comprobaciones posteriores sólo se
acreditan mediante los registros fechados. Los ocho consumidores siguen
clasificados como seguridad y deben actualizarse antes de cerrar ese tramo.

## Modificación propuesta de los doce objetos con token — no ejecutada

Bucket único: `reservaeldia-7a440.firebasestorage.app`. Los nombres exactos y
checksums quedan en el checkpoint privado
`.local-isolation/inventory-continuation-l6bZUe/checkpoint.dpapi`, cifrado para
el mismo usuario de Windows. Los alias siguientes identifican los recursos
observados sin publicar paths, URLs o tokens. No son patrones para operar sobre
todo el prefijo ni autorizan descubrir/adoptar nuevos targets durante la ventana.

| Alias de objeto | Generación observada | Metageneración observada |
| --- | --- | --- |
| `7c5d792e9f03bcb9ec5a572c` | `1785190206486950` | `2` |
| `5002d6b48847ecef164ad716` | `1785191769899184` | `2` |
| `2fe40ffa32dc2a19f5121da3` | `1785191773547090` | `2` |
| `e65c6d92ff982f4d2ff121fd` | `1785191765899587` | `2` |
| `9f2619d12a4f7b437c9cf334` | `1785182609576536` | `2` |
| `45a716642cb2bb9645d6883a` | `1785182570868714` | `2` |
| `c5f924f88e91027cd2945951` | `1785182593930620` | `2` |
| `af53ad9a3df2810228ac9a51` | `1785179432786207` | `2` |
| `8270c69467f6f79c9a2e4b25` | `1785179431160863` | `2` |
| `362be99038d54d0f151a035f` | `1785179433096224` | `2` |
| `4a6cfac60426a3c25ef7963c` | `1785182602786478` | `2` |
| `6364719b4a87dde298acc197` | `1785179430821587` | `2` |

Procedimiento para una ventana expresamente autorizada; **no hay script de
mutación ejecutado ni aprobación implícita**:

1. Resolver los doce nombres desde el checkpoint en memoria; validar bucket,
   alias y generación contra el manifiesto aprobado. No imprimir nombres ni
   valores de token. Si el checkpoint no puede abrirse, no reconstruir nombres
   por suposición: recuperar el manifiesto verificable antes de operar.
2. GET de metadata de cada objeto **live, sin parámetro `generation`**. Debe
   coincidir con la generación y metageneración aprobadas, con checksum y tamaño
   observados. Si difiere, detener ese target y revisar el cambio, sin actualizar
   silenciosamente la lista aprobada. Conservar sólo evidencia saneada.
3. PATCH de metadata del mismo objeto live, **sin `generation`**, con ambas
   precondiciones `ifGenerationMatch` e `ifMetagenerationMatch` tomadas del
   manifiesto revalidado. Cuerpo exacto propuesto:

   ```json
   {
     "metadata": { "firebaseStorageDownloadTokens": null },
     "cacheControl": "private,no-store"
   }
   ```

   No enviar `metadata:null`, `acl` ni `predefinedAcl`. Se retira sólo esa clave
   y se cambia la directiva de caché; se conservan bytes y demás metadata.
   Un `412` detiene la operación. Ante timeout, 5xx o respuesta perdida,
   detener y reconciliar con GET: la operación podría haberse aplicado; no
   reintentar a ciegas. La selección live y las dos precondiciones evitan
   modificar una versión histórica o un reemplazo concurrente.
   [PATCH oficial](https://docs.cloud.google.com/storage/docs/json_api/v1/objects/patch),
   [campos parciales](https://docs.cloud.google.com/storage/docs/json_api#partial-updates),
   [precondiciones](https://docs.cloud.google.com/storage/docs/request-preconditions#best-practices).
4. GET posterior: comparar también con la respuesta PATCH. Exigir generación,
   tamaño y CRC32C conservados; MD5 si estaba presente; token ausente; demás
   custom metadata intacta y `private,no-store`. Sólo admitir cambios esperados
   de metageneración, `updated` y `etag`; una modificación concurrente nueva
   impide certificar el resultado. No descargar los bytes para comparar hashes:
   los checksums de metadata bastan para esta comprobación de integridad.
   [Generaciones y checksums](https://docs.cloud.google.com/storage/docs/metadata).
5. Registrar por alias resultado y pre/postcondiciones, sin conservar tokens
   como backup. Nunca restaurarlos como rollback. Ante un fallo de consumidor
   autorizado, corregir su entrega/autorización y mantener privado el recurso;
   no volver a publicar una capacidad de descarga.

**Impacto y límite:** las URLs que dependan de esos tokens pueden dejar de
funcionar, incluidos consumidores externos no inventariados. No se comprobó
descarga ni uso efectivo; las referencias documentales y estáticas se detallan
en el informe. No hace falta recuperar contenido privado para decidir retirar
una capacidad incompatible con el estado privado requerido. La ausencia del
token después del PATCH prueba metadata, **no una denegación HTTP efectiva**;
esa comprobación sobre contenido privado sigue pendiente y no se presenta como
necesaria para autorizar la modificación condicionada. Un canario sintético
puede comprobar el comportamiento del mecanismo, sin certificar retrospectivamente
la accesibilidad de cada objeto real.

Firebase documenta sus URLs de descarga como revocables, pero la documentación
de PATCH no demuestra por sí sola la revocación HTTP de este recorrido.
`private,no-store` no borra copias ya distribuidas y no revoca URLs firmadas.
Las 8154 directivas públicas observadas no conceden lectura por sí mismas: el
cambio propuesto de caché se limita a los doce targets con token; una limpieza
general de metadata no integra esta propuesta. La política corregida del resolvedor
debe llegar a los ocho consumidores y verificarse para evitar que sigan generando
o reutilizando otras vías de acceso.
[Referencia de descarga Firebase](https://firebase.google.com/docs/reference/ios/firebasestorage/api/reference/Classes/FIRStorageReference#-downloadurlwithcompletion),
[caché de Storage](https://docs.cloud.google.com/storage/docs/metadata#caching-data),
[URLs firmadas](https://docs.cloud.google.com/storage/docs/access-control/signed-urls).

## Registro de ejecución en curso — corte 24/10/2026 01:49:57 UTC

Foto intermedia de la ventana autorizada, no cierre final. El usuario confirmó
«Sí, continuar y dejar A/B pendiente». Se omitieron los canarios autenticados y
la creación de fixtures remotos; la evidencia local no se convierte por ello en
prueba de aislamiento autenticado de producción. El resto del alcance y las
prohibiciones de pagos/comunicaciones de prueba, Hosting y beta permanecen.

La evidencia se conserva fuera de Git en
`.local-isolation/provider-release-20261024T0112Z/` y en las carpetas hermanas
`provider-release-operation-*`, con logs saneados y snapshots IAM cifrados.
El [registro del informe](../testing/DRAFT_PROVIDER_AUTHORIZATION.md#ejecución-autorizada-en-curso--corte-24102026-014957-utc)
detalla los resultados y límites. Los campos `mutations: 0` de los lectores
describen esos GET, **no toda la ventana**, que ya tiene cambios remotos.

| Tramo | Resultado observado al corte | Evidencia |
| --- | --- | --- |
| Contención de tres servicios | `verinvitacion`, `copiarplantilla` y `copiarplantillahtml` sin `allUsers` invoker; no reabiertos | Snapshots DPAPI y comprobaciones anónimas por alias de URL. Un 500 inicial no se contó como denegación; el recheck posterior registró 403 |
| Storage acotado | Readback del release y bytes exactos; ruleset `fa06a161-b080-412b-99dc-50a4a0841268`, SHA256 `40ed3e455aa8ee2510744a25ca968e912f0fb3fe43c28c34f99bf0d590daca80` | `rules-both-1792805613024.json` |
| Firestore acotado | Readback del release y bytes exactos; ruleset `54aa5487-fcd8-481e-a4dd-fe9a4fda1578`, SHA256 `7c6ad315deaa372f6c5d416e89593024480858a32ab1e46e9705411d44eb386c` | Mismo readback |
| `verInvitacion` | CLI exit 0 más readback GEN2/Node 22/Ready/100% tráfico; revisión `verinvitacion-00530-cob`; IAM contenido | Operación `5g5FHv`; `function-readback-1792806433618.json` |
| `copiarPlantilla` | CLI exit 0 más readback GEN2/Node 22/Ready/100% tráfico; revisión `copiarplantilla-00545-til`; IAM contenido | Operación `Z5quTs`; `function-readback-1792806594200.json` |
| Pendientes de esta foto | 9 Functions de seguridad, las 98 restantes, doce objetos, observación de drenaje y reapertura | Secuencia todavía en curso; no se declara runtime final 109/109 ni cierre completo de assets |

La operación utiliza el mismo candidato inmutable en
`.local-isolation/provider-auth-operational-ufsdE0/workspace`; el runner contrasta
los 389 hashes antes de cada comando y ejecuta predeploy/build originales. El
overlay privado conserva valores efectivos; los tres targets Email se despliegan
individualmente por sus diferencias de configuración, sin activar envíos.

Los ajustes del ejecutor que permitieron usar CLI 14.4 sin ampliar el alcance
remoto son los siguientes; no modifican las fuentes del candidato:

1. **Firestore:** selector `firestore:(default),firestore:rules` para el config
   acotado en array. El alias `cloud.firestore/(default)` se vinculó por lectura
   al release existente `cloud.firestore`; el guard admite ese alias sólo con
   el ruleset de bytes exactos. El readback posterior confirma el destino.
2. **Procesos locales:** preload explícito para la CLI y `NODE_OPTIONS` restringido
   a loopback para los hijos de build/discovery. Discovery conserva 30 s, el
   límite del gate existente; no se alteraron pruebas ni sus expectativas.
3. **Identidades administradas:** sólo para actualizaciones de Functions
   existentes se omite `generateServiceIdentity`/`generateServiceIdentityAndPoll`
   después de leer API habilitada y bindings Pub/Sub/Eventarc existentes. Los
   403 al consultar cuentas administradas no se reinterpretan como inexistencia.
   No se crean identidades ni se habilitan APIs; `setIamPolicy` y bootstrap siguen
   bloqueados en el ejecutor de Functions. Los controles del servidor siguen
   aplicándose. La contención/reapertura se realiza por su helper separado.
4. **Email, preparación de tramo pendiente:** se omite únicamente una escritura
   IAM redundante de los dos endpoints privados seleccionados si un GET IAM v3
   demuestra ausencia de binding `roles/run.invoker`. No se permite retirar
   bindings existentes. Para schedulers, la CLI conserva los jobs e invoker
   cuando coinciden; una diferencia no autoriza modificarlos silenciosamente.

Los fallos previos de selección/preparación se conservan en sus carpetas de
operación. El éxito de una llamada CLI no sustituyó los readbacks. Antes de
reabrir, completar el código de seguridad y observar el drenaje; después,
comprobar rechazo anónimo. A/B permanece pendiente. Continuar después con los
98 targets de runtime y registrar el inventario final. Si se detiene la ventana,
dejar explícitos los servicios contenidos y aplicar únicamente la recuperación
segura prevista: no restaurar Rules vulnerables ni tokens. **Estado de esta
captura: en curso, parcial.**

**Actualización operativa, 24/10/2026 01:55:11 UTC:** un intento de
`copiarPlantillaHTML` se detuvo antes de enviar el PATCH porque el comparador
literal trataba como cambio la omisión de `FUNCTION_SIGNATURE_TYPE=http` por
CLI 14.4. Se ajustó el comparador sólo para `http` explícito → ausente en
endpoints HTTP sin event trigger: el
[Functions Framework documenta HTTP como valor por defecto](https://github.com/GoogleCloudPlatform/functions-framework-nodejs#configure-the-functions-framework).
No se habilitó una excepción amplia para variables de plataforma.

La evidencia `revision-config-1792806907271.json` registra seis GET y PASS para
la configuración efectiva anterior/nueva de las dos Functions ya actualizadas:
sin cambio de configuración de negocio, referencias/versiones de Secrets,
volúmenes o cuenta de servicio. No se recuperó contenido de Secrets ni se
certificó su inmutabilidad a partir de aliases. La secuencia HTML y ocho
consumidores continúa. Este agregado no convierte el estado parcial en un
despliegue completo ni sustituye el readback pendiente de esos targets.
