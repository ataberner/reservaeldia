# Operación del catálogo Música V1

Status: Operational Diagnostic Evidence.
Alcance: catálogo estático de assets públicos administrados por Reserva el Día.
Mantenimiento: actualizar al cambiar `shared/musicCatalog.cjs` o la estrategia de entrega.
Autoridad funcional: [MUSIC_SYSTEM_CONTRACT](../contracts/MUSIC_SYSTEM_CONTRACT.md).

## Agregar una canción

Todo cambio se prepara en `feature/music` / `C:\\Reservaeldia-music` y pasa revisión. Esta tarea no despliega ni mergea.

1. Preparar un MP3 que la plataforma pueda distribuir. V1 no implementa upload desde el navegador ni almacenamiento privado.
2. Copiar el archivo a `public/assets/music/<nombre-estable>.mp3`. Esto es la carga manual al catálogo de assets de Hosting, que se subirá con el release normal autorizado desde main. Evitar espacios y no reemplazar bytes bajo una identidad ya publicada; usar un nombre nuevo al cambiar la grabación.
3. Agregar una fila a `MUSIC_CATALOG` en `shared/musicCatalog.cjs`:

```js
Object.freeze({
  id: "ceremonia-piano-01",
  title: "Ceremonia en piano",
  artist: "Nombre del intérprete",
  audioReference: "/assets/music/ceremonia-piano-01.mp3",
  active: true,
}),
```

4. Usar un ID único y estable. El título y artista se muestran en el sidebar; `audioReference` sólo pertenece al catálogo. Nunca poner el archivo o la URL en `borradores.music`.
5. Ejecutar `node functions/scripts/syncTemplateContract.cjs` y `node --test shared/musicConfig.test.mjs`, compilar Functions y ejecutar los tests Música. El sync actualiza las copias de Functions; no editarlas manualmente.
6. Probar selección, guardar/recargar, escucha del sidebar, preview con/sin audio y cierre/reapertura en el entorno aislado. La copia local incluye `public/assets/music` y el MP3 de prueba.
7. Publicar sólo mediante el procedimiento habitual aprobado desde main, incluyendo assets Hosting y consumidores backend del catálogo en el mismo release compatible. No usar un deploy desde el worktree de Música.

La entrada inicial `platform-demo` usa el archivo preexistente `public/assets/musica.mp3` y metadata explícita de prueba. No se inventó el nombre artístico ni la licencia de esa grabación.

## Activar o desactivar

Cambiar `active` a `true` o `false`, sincronizar, verificar y revisar el release correspondiente. La UI lista únicamente entradas activas. Los drafts conservan su ID aunque una canción se desactive; nuevos renders no agregan gate ni audio para esa selección.

La desactivación del catálogo no modifica HTML ya publicado: esos artefactos contienen el recurso resuelto en el momento de publicación. Actualizarlos requiere una republicación autorizada. No borrar el MP3 si todavía lo referencian invitaciones publicadas. Una retirada urgente de contenido requiere un procedimiento operativo específico; no ejecutar migraciones ni revocaciones implícitas.

## Disponibilidad

`MUSIC_FEATURE_AVAILABILITY.editor` controla el rollout de edición; no otorga permisos. `catalog` controla resolución/listado y `user` permanece false. El control administrativo continúa en la autoridad existente. No activar “Mi música” sin implementar validación, ownership, reglas y entrega de recursos privados.

No se agregan permisos de Storage para V1: sus archivos son assets públicos de Hosting. El catálogo no contiene secretos ni recursos privados.
