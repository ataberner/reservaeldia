# Guía operativa para agentes — Reserva el Día

Esta es la entrada común para trabajar en el repositorio, con o sin Prompt Builder.
El [índice documental](docs/DOCUMENTATION_INDEX.md) gobierna la navegación y la
autoridad de los documentos; los contratos específicos conservan sus reglas.

## Producto y orientación

Reserva el Día permite crear invitaciones digitales: un dashboard Next.js abre
un editor React + Konva; Firebase sostiene datos, assets, generación de vista
previa y publicación de HTML.

| Superficie | Dónde empezar a inspeccionar |
| --- | --- |
| Frontend | `src/pages/`, `src/components/`, `src/domain/`, `src/hooks/`; entrada Firebase: `src/firebase.js`. |
| Backend y render | `functions/src/index.ts`, `functions/src/render/`, `functions/src/payments/`, `functions/src/utils/`. |
| Contratos compartidos | `shared/`; revisar consumidores y `functions/scripts/syncTemplateContract.cjs` antes de tocar copias en Functions. |
| Operación y configuración | `scripts/`, ambos `package.json`, `firebase.json`, `firestore.rules`, `storage.rules`, `.github/workflows/`. Leer efectos antes de ejecutar. |
| Documentación y tests | `docs/DOCUMENTATION_INDEX.md`; contratos y mapas enlazan tests próximos al dominio, en `src/`, `shared/`, `functions/` y `scripts/`. |

Usá la ruta del subsistema en el índice para seleccionar contexto mínimo pero
suficiente. No es necesario leer todos los documentos ni todos los contratos
adyacentes. El [mapa general](docs/architecture/ARCHITECTURE_OVERVIEW.md) amplía
esta orientación cuando el flujo cruza subsistemas.

## Autorización y alcance

- El pedido original y sus restricciones delimitan el trabajo. Un modo, etiqueta
  o prompt generado no amplía esa autorización; el Builder consume la autoridad
  del repositorio.
- Investigar no implica permiso para corregir. Preparar una implementación para
  producción no implica permiso para desplegar, migrar ni operar servicios.
- Preservá cambios ajenos, incluso sin commit. No limpies, reviertas ni incluyas
  modificaciones fuera del alcance; si hay solapamiento, separá tu diff y señalalo.

## Antes de modificar

1. Leé las instrucciones aplicables, incluida cualquier guía de la ruta afectada.
2. Revisá Git y los cambios preexistentes; identificá qué pertenece a esta tarea.
3. Consultá el índice documental.
4. Seleccioná contratos, mapas, decisiones y baselines del flujo alcanzado.
5. Inspeccioná implementación, callers, consumidores y tests relevantes.
6. Identificá responsables de estado, mutación, persistencia y render, y las
   fuentes de verdad de cada tramo. Distinguí adapters de autoridades duplicadas.
7. Definí comportamiento esperado, alcance y verificaciones según el riesgo.
8. Recién entonces modificá comportamiento, si está autorizado.

El [procedimiento por tipo de tarea](docs/operations/CHANGE_WORKFLOW.md) detalla
preparación y evidencia específicas; complementa este flujo sin ampliar permisos.

Para una corrección trivial, esta revisión puede ser breve. En un bug, localizá
el primer invariante roto y su causa con evidencia; en performance, reuní una
línea base y compará después. No agregues instrumentación antes de revisar la
existente ni reproduzcas fallas contra producción sin autorización.

## Contradicciones y conocimiento faltante

- El código demuestra la implementación actual; no decide automáticamente qué
  debería hacer. Los tests pueden contener expectativas obsoletas.
- Aplicá la [jerarquía y resolución de contradicciones](docs/DOCUMENTATION_INDEX.md#authority-and-conflicts):
  distinguí defecto de implementación, documentación desactualizada y cambio
  contractual deliberado. No cambies contratos o tests para justificar un bug.
- Si dos autoridades aceptadas son incompatibles, registrá la contradicción y
  obtené resolución explícita para la parte dependiente; no elijas una por comodidad.
- La falta de un documento específico permite investigar y resolver detalles
  locales respaldados por evidencia. No permite inventar decisiones importantes
  de permisos, datos, negocio o compatibilidad.
- Separá HECHO comprobado, DECLARACIÓN documental, DECISIÓN con su estado,
  HIPÓTESIS por contrastar, PENDIENTE verificable y CONTRADICCIÓN cuando importe.
  Registrá decisiones abiertas en su autoridad existente, con pregunta,
  alternativas, información faltante y cambio condicionado. Continuá lo independiente.

## Implementación y seguridad

- Usá los responsables existentes; evitá nuevas fuentes de verdad y caminos
  paralelos innecesarios. Conservá compatibilidad salvo cambio contractual autorizado.
- Para código, consultá [ARCHITECTURE_GUIDELINES.md](docs/architecture/ARCHITECTURE_GUIDELINES.md),
  en particular sus estándares de calidad, y el contrato específico del subsistema.
- Antes de ejecutar un comando, revisá su definición, destino, credenciales por
  origen (sin exponer valores), servicios conectados y archivos o estado que puede
  modificar. `dev`, `emulators` y `dry-run` no garantizan aislamiento.
- Consultá las [limitaciones operativas actuales](docs/architecture/SYSTEM_FRAGILITY_MAP.md#operational-readiness)
  y los procedimientos aplicables enlazados desde el índice. No asumas que Rules,
  entorno local o CI ya protegen el flujo. No expongas secretos ni datos sensibles
  en logs, fixtures, documentación o entregas.

## Verificación y Definition of Done

Una tarea se puede dar por completada cuando, dentro de su alcance:

- cumple el comportamiento solicitado y conserva contratos e invariantes;
- mantiene seguridad, propiedad de datos y aislamiento aplicables, con evidencia
  proporcional; documentar un riesgo no lo resuelve;
- tiene pruebas adecuadas al riesgo (regresión, casos negativos y de borde cuando
  corresponda) y se ejecutaron los checks relevantes disponibles;
- verifica los consumidores afectados; desktop/mobile, UI y paridad entre runtimes
  se comprueban cuando el cambio alcanza esas superficies;
- conserva coherencia de contratos compartidos y sus copias cuando aplica; si hay
  una migración autorizada, verifica destino, compatibilidad, recuperación y efectos
  según su procedimiento, sin asumir salvaguardas universales;
- actualiza selectivamente el documento responsable cuando cambian contratos,
  decisiones, autoridades, datos, operación o referencias; no exige documentación
  por formatting o refactor interno sin cambio contractual ni referencias obsoletas;
- revisa el diff final y comunica fallas preexistentes, checks omitidos y riesgos
  residuales. Nunca declares que un check pasa si no se ejecutó. Una falla previa
  no se oculta ni se atribuye automáticamente al cambio; un check bloqueado limita
  lo que puede afirmarse como verificado.

Los [anclajes y efectos de verificación](docs/DOCUMENTATION_INDEX.md#verification-entry-points)
ayudan a elegir checks, sin autorizar su ejecución fuera del pedido.

## Entrega

Entregá un cierre breve con: resultado y alcance; cambios relevantes;
verificaciones ejecutadas y sus resultados; documentación actualizada cuando
corresponda; pendientes, limitaciones y decisiones sin resolver. Incluí rutas y
evidencia reproducible, separá lo observado de lo no verificado y no presentes
trabajo técnico pendiente como resuelto por haberlo documentado.
