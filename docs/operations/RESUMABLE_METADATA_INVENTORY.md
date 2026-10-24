# Continuación paginada del inventario de metadatos

Status: Operational Diagnostic Procedure. Fecha: 2026-10-23.
Complementa [el inventario inicial](LEGACY_DRAFT_READ_ONLY_INVENTORY.md).
No autoriza modificaciones remotas, adopción de objetos, revocaciones ni despliegues.

## Alcance

`scripts/inventoryContinuation.mjs` enumera documentos de `borradores` mediante
proyección de los mismos campos técnicos del inventario inicial. Enumera las
generaciones actuales y no actuales de objetos bajo `borradores/` y
`proveedores/`, y consulta por separado los objetos recuperables por soft delete.
Consulta configuración del bucket y ACL predeterminada; reutiliza la evidencia
anterior de IAM directo, expresamente marcada como histórica. IAM heredado y
otras superficies pertenecen a la auditoría separada.

Esta continuación acepta únicamente metadatos. Rechaza `--verify-hashes` y no
descarga HTML, imágenes, URLs con token ni contenido de proveedores. La
clasificación que requiere demostrar bytes conserva `pending_hash`; no la
convierte en compatible. Fuentes de plantilla se consultan sólo por metadatos
y generación cuando un borrador HTML válido requiere resolver una reserva sin
destino. No consulta perfiles ni contactos.

Una segunda etapa autorizada, `scripts/providerMetadataContinuation.mjs`,
enumera documentos de `proveedores` por páginas de 10, proyectando únicamente
`estado`, `activo`, `visible`, `imagenes.portada.storagePath`,
`imagenes.portada.url` e `imagenes.galeria`. Firestore no proyecta campos dentro
de cada elemento de un array: la galería llega como mapas, de los que sólo se
inspeccionan `storagePath` y `url`; se descartan `alt`, `urlOriginal` y los demás
campos antes de persistir. Las URLs se interpretan en memoria para vincular
referencias al bucket permitido; nunca se descargan ni se guardan completas.
Los tokens de URLs se transforman en HMAC para comprobar igualdad con metadata,
sin guardar el valor. Una URL no reconocida se cuenta como tal, no como ausencia
de referencias. No se examinan referencias fuera de esa proyección.

Al completar los documentos se releen sólo los objetos de proveedores con token
observado, por nombre y generación exacta (máximo 100), para capturar
metageneración y checksums CRC32C/MD5 en el checkpoint cifrado. Eso proporciona
precondiciones revisables para una eventual propuesta, no demuestra uso ni
autoriza modificaciones. El transporte compartido conserva su guard por
defecto; la segunda etapa inyecta guards internos exclusivos para esa consulta
fija y esas lecturas de metadata. No hay un flag para habilitar requests
arbitrarios. Un cambio de metageneración desde el listado queda indicado.

También consulta por GET los dos nombres exactos de objeto `borradores` y
`proveedores`: un prefijo con barra no los incluye, aunque Rules recursivas
puedan alcanzarlos. Sólo 404 acredita ausencia de su generación actual; otros
errores conservan el pendiente. No se enumeran generaciones históricas de esos
dos nombres exactos. Sus ACL, si el objeto existe, deben ser observables o estar
desactivadas por UBLA antes de dar por completa esa comprobación.

## Reanudación y privacidad

La muestra `.local-isolation/inventory-nmiugX` no conservó cursores, nombres
originales ni su clave de seudonimización. Por eso esta continuación debe volver
a leer las páginas iniciales; no se presenta como una reanudación exacta de
aquella muestra ni salta 200 registros suponiendo un orden estable.

Desde la primera página nueva, conserva nombres y cursores únicamente dentro
de `checkpoint.dpapi`, cifrado con DPAPI CurrentUser. Se usa un directorio hijo
directo `.local-isolation/inventory-continuation-*`, ignorado por Git. No cambia
ACL locales. La clave HMAC aleatoria queda cifrada: los alias no permiten
correlacionar identificadores entre ejecuciones sin esa clave. Los tokens nunca
se guardan; sólo se guardan sus alias HMAC y presencia. No se guardan nombres de
principales privados de ACL. El informe público contiene agregados, alias y
generación/metageneración, sin nombres de objetos ni identificadores de personas.

El checkpoint se reemplaza tras completar cada página. Una página fallida no
avanza su cursor. Un lote posterior retoma ese cursor; los errores históricos
permanecen visibles aunque se resuelva el bloqueo. Un lock evita dos lectores
simultáneos del mismo checkpoint. Un lock abandonado requiere revisar primero
el proceso anterior, sin borrarlo automáticamente.

DPAPI requiere el perfil del mismo usuario de Windows: el sandbox de esta
sesión no permite esa operación, mientras que la ejecución autorizada fuera
del sandbox sí. No se sustituye cifrado por archivos en texto plano.

## Ejecución autorizada

Sin `--execute-read-only` se muestra el plan sin credenciales ni red. La
ejecución exige proyecto, bucket y directorio explícitos. El token se obtiene
en memoria mediante ADC con archivo explícito y scopes `datastore` y
`devstorage.read_only`; se pasa como propiedad del argumento `env` a `main`,
sin imprimirlo, escribirlo ni agregarlo al entorno global. No se ejecuta login.

Antes del primer lote, conservar copia y SHA-256 de los módulos locales usados,
incluidas dependencias transitivas del modelo; registrar versión de Node y
modalidad de ejecución. No copiar ADC, `.env` ni credenciales a evidencias.

El transporte permite sólo GET a los endpoints concretos de Firestore/Storage
y POST de lectura `runQuery`, rechaza redirecciones y destinos ajenos. No utiliza
Admin SDK, Functions, navegador ni operaciones de modificación. Los errores se
reducen a códigos seguros: nunca se registra el cuerpo HTTP ni errores crudos
del SDK de credenciales.

## Límites y resultados

- Por respuesta: 512 KiB; por lote: 200 requests, 10 MiB y 180 segundos.
- Por página: 25 elementos; por lote: 1–80 páginas, predeterminado 20.
- Por sesión: 20.000 documentos, 20.000 objetos por etapa, 5.000 requests y
  100 MiB. El restante global limita también el tamaño aceptado de cada respuesta.
- No se amplían presupuestos automáticamente. Una respuesta por chunks que
  rebasa su límite se aborta al observar el chunk y se contabiliza; no se acepta
  el payload. El límite no puede evitar bytes ya recibidos por la red.

`coverage.allPagesFinished` significa que terminaron los recorridos permitidos,
no que se haya demostrado privacidad ni procedencia. `complete` exige además
ACL observables (o desactivadas por UBLA), historial soft delete observado y
ninguna clasificación pendiente. Si la política actual de soft delete está
desactivada, la API no admite ese listado: se registra como historial no
observable, sin afirmar que estuvo siempre vacío. Una ACL predeterminada no
observable tampoco se presenta como privada.

Los listados no son un snapshot entre servicios. No se consulta historia/PITR de
Firestore, prefijos distintos, copias externas, URLs firmadas ya emitidas,
caches, uso efectivo de tokens ni todas las identidades IAM. Las generaciones
se registran para diagnosticar, no para atribuir titularidad. Los objetos pueden
cambiar después de observarlos; cualquier futura actuación requiere releer sus
precondiciones con autorización independiente.

Limitación de la versión ejecutada: el saneamiento de `userId` transforma todos
los strings en HMAC antes de clasificarlos. El checkpoint no conserva si el
valor original era vacío o sólo espacios. Por eso el inventario no acredita
validez de identidad ni propiedad; no se repiten lecturas para reconstruir ese
dato. Los conteos observados por editor y papelera, y la ausencia de objetos en
el namespace HTML, son observaciones separadas de esa validación.

## Verificación

`node --test scripts/inventoryContinuation.test.mjs` usa fixtures sintéticos y
DPAPI sobre una cadena artificial, sin red. Cubre reanudación, rollback de
página fallida, descarte de secretos, cifrado, namespace local, presupuestos,
rechazo de contenido privado y distinción entre observado y no observable.
Las pruebas del runner/modelo original conservan su evidencia previa; no deben
repetirse sin cambios o un motivo nuevo.

`node --test scripts/providerMetadataContinuation.test.mjs` comprueba la
proyección fija, rechazo de otros proyectos/rutas/métodos, default del transporte
sin ampliar, redacción de errores, galería, reanudación y referencias sin secretos.
No requiere DPAPI ni hace llamadas remotas.
