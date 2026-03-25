function deepClone(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => deepClone(entry));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const out = {};
  Object.entries(value).forEach(([key, nestedValue]) => {
    out[key] = deepClone(nestedValue);
  });
  return out;
}

function normalizeToken(value) {
  return String(value || "fixture-token")
    .trim()
    .replace(/[^a-z0-9-]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "fixture-token";
}

export const FIXTURE_BUCKET = "reservaeldia-7a440.firebasestorage.app";

// Representative storage paths derived from current repo data and active prefixes:
// - backups/plantillas-backup-20260302-165946.json
// - functions/src/countdownPresets/service.ts
export const FIXTURE_PATHS = Object.freeze({
  heroImage:
    "usuarios/8mvF9cwdbtYo2leAjO11cNxhaLV2/imagenes/1769726410069_portada.jpg",
  galleryOne:
    "usuarios/8mvF9cwdbtYo2leAjO11cNxhaLV2/imagenes/1769826362132_9.jpg",
  galleryTwo:
    "usuarios/8mvF9cwdbtYo2leAjO11cNxhaLV2/imagenes/1769826365146_10.jpg",
  galleryThree:
    "usuarios/8mvF9cwdbtYo2leAjO11cNxhaLV2/imagenes/1769826368612_11.jpg",
  sectionBackground:
    "usuarios/8mvF9cwdbtYo2leAjO11cNxhaLV2/imagenes/1754504606456_fondo-pareja3.svg",
  rasterIcon:
    "user_uploads/fixture-owner/icons/1775000000002-marker-gold.png",
  decorTop:
    "borradores/fixture-owner/decoraciones/1775000000000-flor-superior.png",
  decorBottom:
    "previews/fixture-owner/decoraciones/1775000000001-flor-inferior.png",
  countdownFrame:
    "previews/countdown/frames/1775000000003-frame-floral.svg",
});

export function buildFirebaseDownloadUrl(path, token = "fixture-token") {
  return `https://firebasestorage.googleapis.com/v0/b/${FIXTURE_BUCKET}/o/${encodeURIComponent(
    String(path || "").trim().replace(/^\/+/, "")
  )}?alt=media&token=${normalizeToken(token)}`;
}

export function buildGsUrl(path, bucketName = FIXTURE_BUCKET) {
  return `gs://${String(bucketName || FIXTURE_BUCKET).trim()}/${String(path || "")
    .trim()
    .replace(/^\/+/, "")}`;
}

export function buildTemplateSharedPath(
  plantillaId,
  fileName = "already-shared-gallery.jpg"
) {
  return `plantillas/${String(plantillaId || "template-fixture")
    .trim()
    .replace(/^\/+/, "")}/assets/${fileName}`;
}

function buildBaseSections({
  heroBackground,
  decorTop,
  decorBottom,
  decorationShape = "legacy-slots",
}) {
  const heroDecorations =
    decorationShape === "items"
      ? {
          parallax: "soft",
          items: [
            {
              id: "decor-top",
              nombre: "Flor superior",
              src: decorTop,
              storagePath: FIXTURE_PATHS.decorTop,
              x: 0,
              y: 0,
              width: 220,
              height: 160,
              rotation: 0,
              orden: 0,
            },
            {
              id: "decor-bottom",
              nombre: "Flor inferior",
              url: decorBottom,
              storagePath: FIXTURE_PATHS.decorBottom,
              x: 580,
              y: 420,
              width: 180,
              height: 120,
              rotation: 0,
              orden: 1,
            },
          ],
        }
      : {
          parallax: "soft",
          superior: {
            id: "decor-top",
            nombre: "Flor superior",
            url: decorTop,
            storagePath: FIXTURE_PATHS.decorTop,
            x: 0,
            y: 0,
            width: 220,
            height: 160,
            rotation: 0,
            orden: 0,
          },
          inferior: {
            id: "decor-bottom",
            nombre: "Flor inferior",
            src: decorBottom,
            storagePath: FIXTURE_PATHS.decorBottom,
            x: 580,
            y: 420,
            width: 180,
            height: 120,
            rotation: 0,
            orden: 1,
          },
        };

  return [
    {
      id: "section-hero",
      orden: 1,
      altura: 600,
      altoModo: "pantalla",
      fondo: "#ffffff",
      fondoTipo: "imagen",
      fondoImagen: heroBackground,
      fondoImagenOffsetX: 0,
      fondoImagenOffsetY: 0,
      fondoImagenScale: 1,
      decoracionesFondo: heroDecorations,
    },
    {
      id: "section-gallery",
      orden: 2,
      altura: 720,
      altoModo: "fijo",
      fondo: "#ffffff",
    },
    {
      id: "section-details",
      orden: 3,
      altura: 540,
      altoModo: "fijo",
      fondo: "#ffffff",
    },
  ];
}

function buildBaseObjects({
  heroImage,
  rasterIcon,
  galleryCells,
  countdownFrame,
}) {
  return [
    {
      id: "hero-image",
      tipo: "imagen",
      seccionId: "section-hero",
      x: 24,
      y: 40,
      yNorm: 0.08,
      width: 320,
      height: 440,
      url: heroImage,
      storagePath: FIXTURE_PATHS.heroImage,
    },
    {
      id: "gallery-main",
      tipo: "galeria",
      seccionId: "section-gallery",
      width: 680,
      height: 420,
      galleryLayoutMode: "dynamic_media",
      cells: galleryCells,
    },
    {
      id: "count-modern",
      tipo: "countdown",
      seccionId: "section-hero",
      countdownSchemaVersion: 2,
      fechaObjetivo: "2026-06-01T20:00:00.000Z",
      width: 320,
      height: 120,
      visibleUnits: ["days", "hours", "minutes", "seconds"],
      frameSvgUrl: countdownFrame,
    },
    {
      id: "count-legacy",
      tipo: "countdown",
      seccionId: "section-details",
      fechaISO: "2026-05-10T20:00:00.000Z",
      width: 280,
      height: 96,
    },
    {
      id: "icon-raster",
      tipo: "icono",
      formato: "png",
      seccionId: "section-details",
      width: 64,
      height: 64,
      url: rasterIcon,
      storagePath: FIXTURE_PATHS.rasterIcon,
    },
    {
      id: "icon-legacy",
      tipo: "icono-svg",
      seccionId: "section-details",
      width: 96,
      height: 96,
      color: "#111111",
      d: "M0 0 L10 10",
    },
  ];
}

export function createRepresentativeDraftLoadStageState() {
  return deepClone({
    objetos: buildBaseObjects({
      heroImage: buildFirebaseDownloadUrl(FIXTURE_PATHS.heroImage, "hero-load"),
      rasterIcon: buildFirebaseDownloadUrl(FIXTURE_PATHS.rasterIcon, "icon-load"),
      galleryCells: [
        {
          mediaUrl: buildFirebaseDownloadUrl(FIXTURE_PATHS.galleryOne, "gallery-load-1"),
          fit: "cover",
          bg: "#f3f4f6",
        },
        {
          url: buildFirebaseDownloadUrl(FIXTURE_PATHS.galleryTwo, "gallery-load-2"),
          fit: "cover",
          bg: "#f3f4f6",
        },
        {
          src: buildFirebaseDownloadUrl(FIXTURE_PATHS.galleryThree, "gallery-load-3"),
          fit: "cover",
          bg: "#f3f4f6",
        },
      ],
      countdownFrame: buildFirebaseDownloadUrl(
        FIXTURE_PATHS.countdownFrame,
        "countdown-load"
      ),
    }),
    secciones: buildBaseSections({
      heroBackground: buildFirebaseDownloadUrl(
        FIXTURE_PATHS.sectionBackground,
        "section-load"
      ),
      decorTop: buildFirebaseDownloadUrl(FIXTURE_PATHS.decorTop, "decor-top-load"),
      decorBottom: buildFirebaseDownloadUrl(
        FIXTURE_PATHS.decorBottom,
        "decor-bottom-load"
      ),
      decorationShape: "legacy-slots",
    }),
  });
}

export function createRepresentativePreviewPreparationStageState() {
  return createRepresentativeDraftLoadStageState();
}

export function createRepresentativeTemplateCopyStagePayload({
  plantillaId = "template-fixture",
} = {}) {
  const sharedGalleryPath = buildTemplateSharedPath(
    plantillaId,
    "1775000000004-already-shared-gallery.jpg"
  );

  return deepClone({
    portada: buildFirebaseDownloadUrl(FIXTURE_PATHS.heroImage, "hero-template-source"),
    objetos: buildBaseObjects({
      heroImage: buildGsUrl(FIXTURE_PATHS.heroImage),
      rasterIcon: buildGsUrl(FIXTURE_PATHS.rasterIcon),
      galleryCells: [
        {
          url: FIXTURE_PATHS.galleryOne,
          fit: "cover",
          bg: "#f3f4f6",
        },
        {
          src: buildFirebaseDownloadUrl(FIXTURE_PATHS.galleryTwo, "gallery-template-source"),
          fit: "cover",
          bg: "#f3f4f6",
        },
        {
          mediaUrl: buildFirebaseDownloadUrl(sharedGalleryPath, "shared-gallery-stable"),
          fit: "cover",
          bg: "#f3f4f6",
        },
      ],
      countdownFrame: buildGsUrl(FIXTURE_PATHS.countdownFrame),
    }),
    secciones: buildBaseSections({
      heroBackground: buildGsUrl(FIXTURE_PATHS.sectionBackground),
      decorTop: buildGsUrl(FIXTURE_PATHS.decorTop),
      decorBottom: buildFirebaseDownloadUrl(
        FIXTURE_PATHS.decorBottom,
        "decor-bottom-template-source"
      ),
      decorationShape: "items",
    }),
  });
}

export function createRepresentativePublishNormalizationStageState() {
  return deepClone({
    objetos: buildBaseObjects({
      heroImage: FIXTURE_PATHS.heroImage,
      rasterIcon: buildGsUrl(FIXTURE_PATHS.rasterIcon),
      galleryCells: [
        {
          url: FIXTURE_PATHS.galleryOne,
          fit: "cover",
          bg: "#f3f4f6",
        },
        {
          src: buildGsUrl(FIXTURE_PATHS.galleryTwo),
          fit: "cover",
          bg: "#f3f4f6",
        },
        {
          mediaUrl: buildFirebaseDownloadUrl(FIXTURE_PATHS.galleryThree, "gallery-publish-3"),
          fit: "cover",
          bg: "#f3f4f6",
        },
      ],
      countdownFrame: FIXTURE_PATHS.countdownFrame,
    }),
    secciones: buildBaseSections({
      heroBackground: buildGsUrl(FIXTURE_PATHS.sectionBackground),
      decorTop: FIXTURE_PATHS.decorTop,
      decorBottom: buildGsUrl(FIXTURE_PATHS.decorBottom),
      decorationShape: "legacy-slots",
    }),
  });
}
