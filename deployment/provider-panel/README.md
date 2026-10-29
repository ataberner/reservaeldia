# Publicación acotada del panel de proveedores

Status: Operational Diagnostic Evidence.
Preparación: 2026-10-29. El diseño está implementado y verificado localmente;
la publicación se acredita con el resultado del workflow y su artefacto, no con
la existencia de este documento.

## Diseño y comprobaciones locales

`00d8363a` amplía el listado, compacta las filas, agrupa los filtros secundarios
en una sección plegable y mantiene visibles la cabecera y la paginación.
El formulario conserva su ancho. No cambia permisos, consultas, filtros,
contenido, orden ni tamaño de página.

El test focalizado `src/components/admin/providers/providerAdmin.test.mjs`
pasó 11/11. El recorrido visual con el componente y hook reales, datos
sintéticos y transporte local cubrió escritorio, tablet y móvil; filtros,
vacío, error, reintento y retorno desde detalle. A 1536×639 el ancho de tabla
pasó de 1082 a 1471 px y se vieron cinco filas completas en lugar de una.
Es evidencia local de interfaz; no acredita acceso autenticado en producción.

## Por qué la publicación conserva el sitio vigente

La inspección remota previa encontró Hosting `ef5d2c65c0d1daf7`, release
`1793301164323000`, publicado el 2026-10-29 a las 19:12:44 UTC. Incluye cambios
de otras páginas que todavía no están integrados en `main` (`2f099fc5`).
Un export completo desde esa base retiraría mejoras ya publicadas.

El workflow de merge mantiene su gate integral `verification` y su build.
Cuando el diff contiene el componente o CSS del panel y sólo los archivos
enumerados en su selector, prepara una publicación limitada a
`admin/proveedores/index.html` y recursos nuevos bajo `_next/static/`.
Si el cambio del panel incluye archivos fuera de esa lista, la publicación se
detiene para reconciliar su alcance. Los diffs sin cambios del panel conservan
el recorrido de Hosting existente. El workflow de PR mantiene su preview y
verificaciones. Para la rama `feat/proveedores-panel-compacto` también prepara
esa composición contra la versión viva antes de integrar, validando los hashes
reales en Linux sin publicar en el canal live.

`scripts/prepareProviderPanelHosting.cjs` lee la versión vigente, compara su
configuración con `firebase.json`, descarga y valida todos sus archivos contra
el inventario de Hosting, conserva sus bytes y agrega el panel compilado junto
con los nuevos recursos estáticos del build completo, incluidos chunks diferidos.
Rechaza colisiones de archivos estáticos, rutas inseguras, cambios concurrentes
y consultas que superen sus límites: 1000 archivos, 150 MiB, 30 s por petición,
seis descargas simultáneas. Una falla detiene la publicación; nunca cambia a un
export completo como recuperación.

El build ID del dashboard preservado sigue siendo la referencia de
`verify:hosting:production`; el nuevo build ID del panel queda en el reporte.
El paso `assert-current` comprueba nuevamente la versión inmediatamente antes
de Hosting. La concurrencia `firebase-hosting-live` serializa este workflow;
las publicaciones manuales deben coordinarse, porque Hosting no ofrece aquí una
operación atómica de comparación y publicación.

Después se contrastan el inventario remoto completo, la configuración y el
HTML del panel. El artefacto `provider-panel-hosting-<run id>` conserva reportes
sanitizados. No contiene credenciales ni datos de proveedores.

## Alcance remoto y recuperación

Únicamente Hosting. No se despliegan Functions, Rules, índices ni datos. La
lectura previa observó `panelEnabled:true`, `privateDirectoryEnabled:true`,
`directoryEnabled:false`, `onboardingEnabled:false`; esta entrega no los escribe.
Los permisos existentes de superadmin se mantienen en la ruta y el backend.

Antes de integrar, comprobar checks y base del PR; después, verificar el panel
con la sesión superadmin disponible, vista móvil y rechazo anónimo. No usar
fichas reales como datos de escritura para una mejora visual.

Si se necesita recuperar la interfaz, preparar otro cambio acotado del panel
sobre la versión entonces vigente. Conservar los archivos ajenos y las
protecciones actuales; no restaurar una versión completa histórica del sitio.

El contrato funcional sigue en
[PROVIDER_DATA_MODEL.md](../../docs/architecture/PROVIDER_DATA_MODEL.md), y el
mapa visual en
[LANDING_DASHBOARD_STYLING_MAP.md](../../docs/architecture/LANDING_DASHBOARD_STYLING_MAP.md).
