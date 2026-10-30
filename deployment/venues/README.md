# Publicación acotada del buscador de lugares

Status: Operational Diagnostic Evidence.
Preparación: 2026-10-30. El usuario autorizó integrar y publicar el rediseño de
`/lugares/` después de completar las verificaciones pendientes. Este documento
describe el procedimiento; la integración y el despliegue sólo quedan
acreditados por sus comprobantes remotos.

## Artefacto que conserva el sitio vigente

La base Git integrada no contiene todos los cambios ajenos que ya están en
Hosting. No se debe sustituir producción por el export completo del candidato.
El compositor existente `scripts/prepareProviderPanelHosting.cjs` admite el
scope explícito `venues`; el comportamiento por defecto `panel` se conserva.

Para `venues` toma la versión live vigente y reemplaza únicamente
`lugares/index.html` y `proveedor/index.html`. El segundo documento acompaña el
regreso al buscador mediante navegación completa, sin rediseñar el detalle.
Agrega archivos nuevos bajo `_next/static/` sin reemplazar
ningún recurso que ya exista con bytes distintos. Conserva todos los demás
archivos y verifica que el arte editorial reutilizado
`assets/profesionales/wedding-triptych.png` ya esté publicado con los mismos
bytes que el candidato. No modifica `firebase.json`, Rules, índices, datos ni
configuración de beta. Los límites, comprobación de inventario/hash,
rechazo de concurrencia y recuperación local del compositor se mantienen.

Comandos después del build revisado, con credenciales de servicio del proyecto
ya configuradas en memoria por el workflow (no copiarlas a archivos ni logs):

```text
node scripts/prepareProviderPanelHosting.cjs prepare venues
node scripts/prepareProviderPanelHosting.cjs assert-current venues
```

El paso existente de Hosting aplica el `out` compuesto. Después:

```text
node scripts/prepareProviderPanelHosting.cjs verify venues
```

Los reportes separados son `.local-isolation/venues-hosting.json` y
`.local-isolation/venues-hosting-verified.json`. Incluyen inventario/hash y los
build IDs de la ruta nueva y del dashboard preservado, no datos de proveedores
ni credenciales. El build ID del dashboard sigue siendo la referencia del check
general `verify:hosting:production`.

## Selección y orden operativo

`scripts/selectProviderHostingScope.cjs` selecciona `panel`, `venues` o el flujo
completo existente. Si una ruta acotada aparece junto a archivos no incluidos
en su lista revisada, o junto a otra ruta acotada, falla en vez de publicar todo
el sitio. El scope se calcula sobre los commits efectivos en PR y merge, no
únicamente por nombre de rama. No se deshabilita ningún automatismo compartido.

La rama `codex/lugares-busqueda-mapa` tiene un workflow de candidato sin Hosting
para completar el gate antes de abrir el PR. El PR conserva el gate y prepara
el mismo artefacto acotado en su canal de preview. `main` conserva su gate,
concurrencia live y comprobación `assert-current` inmediatamente antes del
deploy. Una publicación manual concurrente aún requiere coordinación: el
servicio no ofrece una operación atómica de comparación y publicación en este
recorrido.

1. Completar verificaciones locales/aisladas y checks obligatorios.
2. Verificar que sólo `default:providerDirectoryV1` necesita actualización;
   desplegar esa Function compatible antes del Hosting. Mantener el endpoint
   de imágenes y todas las Functions ajenas sin redeploy.
3. Confirmar autorización superadmin existente y controles efectivos:
   `panelEnabled:true`, `privateDirectoryEnabled:true`, `directoryEnabled:false`,
   `onboardingEnabled:false`. Esta entrega no necesita escribirlos.
4. Abrir/revisar/integrar el PR con las protecciones actuales y el backend listo.
5. Verificar inventario y bytes preservados, navegación de entrada/salida,
   búsqueda, mapa desktop/móvil, rechazo anónimo y sesión habitual superadmin.
   Registrar límites acordados de cuenta común y carga de fotos por separado.

## Navegación y recuperación

Los documentos conservados y el nuevo pueden tener distintos build IDs.
Conservar ambos conjuntos de chunks evita referencias inexistentes; por sí solo
no garantiza que la navegación cliente de Next use la página nueva o mantenga
el dashboard actualmente publicado. El adaptador del header usa navegación
documental y el detalle regresa al buscador con enlace nativo; su presentación
permanece igual. Verificar esos recorridos después de publicar. No modificar
manifiestos ni chunks históricos para ocultar diferencias; cualquier ruta
adicional necesita un alcance nuevo explícito y revisado.

Si falla la publicación, detenerla y conservar evidencia; no cambiar al export
completo como alternativa. Si falla la vista privada ya publicada, cerrar sólo
el acceso privado afectado y corregir o recuperar la ruta mediante otro
artefacto acotado sobre el Hosting entonces vigente. No revertir todo el sitio
ni restaurar permisos vulnerables. La apertura pública sigue fuera de alcance.

Contrato funcional y evidencia local:
[PROVIDER_DATA_MODEL](../../docs/architecture/PROVIDER_DATA_MODEL.md),
[PROVIDER_PRIVATE_DIRECTORY](../../docs/testing/PROVIDER_PRIVATE_DIRECTORY.md).
