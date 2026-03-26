import {
  FIXTURE_PATHS,
  buildFirebaseDownloadUrl,
  buildGsUrl,
  createRepresentativePublishNormalizationStageState,
} from "./renderAssetContractFixtures.mjs";

const FIXED_UPDATED_AT_ISO = "2026-03-25T15:00:00.000Z";
const FIXED_FIRST_PUBLISHED_AT_ISO = "2025-10-01T20:00:00.000Z";
const FIXED_LAST_PUBLISHED_AT_ISO = "2026-03-20T18:30:00.000Z";
const FIXED_EXPIRES_AT_ISO = "2026-10-01T20:00:00.000Z";
const CROPPED_IMAGE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAASSURBVBhXYziRYvQfGTOQLgAAApcl0dbqsh0AAAAASUVORK5CYII=";

function deepClone(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => deepClone(entry));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const next = {};
  Object.entries(value).forEach(([key, nestedValue]) => {
    next[key] = deepClone(nestedValue);
  });
  return next;
}

function buildDraftMetadata(overrides = {}) {
  const base = {
    slug: "fixture-publish-validation",
    userId: "fixture-owner",
    editor: "konva",
    nombre: "Fixture publish validation",
    tipoInvitacion: "boda",
    tipo: "boda",
    plantillaId: "fixture-template",
    portada: buildFirebaseDownloadUrl(FIXTURE_PATHS.heroImage, "publish-validation-portada"),
    thumbnailUrl: buildFirebaseDownloadUrl(
      FIXTURE_PATHS.heroImage,
      "publish-validation-thumb"
    ),
    publicationLifecycle: {
      state: "draft",
      activePublicSlug: null,
      firstPublishedAt: null,
      expiresAt: null,
      lastPublishedAt: null,
      finalizedAt: null,
    },
    draftContentMeta: {
      policyVersion: 1,
      canonicalSource: "draft_render_state",
      lastWriter: "canvas",
      updatedAt: FIXED_UPDATED_AT_ISO,
    },
    ultimaEdicion: FIXED_UPDATED_AT_ISO,
    updatedAt: FIXED_UPDATED_AT_ISO,
  };

  return {
    ...base,
    ...deepClone(overrides),
  };
}

function withDraftMetadata(renderState, metadataOverrides = {}) {
  return {
    ...buildDraftMetadata(metadataOverrides),
    ...deepClone(renderState),
  };
}

function buildRsvpButton(overrides = {}) {
  return {
    id: "rsvp-cta",
    tipo: "rsvp-boton",
    seccionId: "section-details",
    x: 72,
    y: 72,
    width: 240,
    height: 54,
    texto: "Confirmar asistencia",
    ...deepClone(overrides),
  };
}

function buildGiftButton(overrides = {}) {
  return {
    id: "gift-cta",
    tipo: "regalo-boton",
    seccionId: "section-details",
    x: 72,
    y: 156,
    width: 240,
    height: 54,
    texto: "Ver regalos",
    ...deepClone(overrides),
  };
}

function buildPantallaTitle(overrides = {}) {
  return {
    id: "hero-title",
    tipo: "texto",
    seccionId: "section-hero",
    x: 48,
    y: 152,
    width: 360,
    texto: "Nos casamos",
    fontSize: 42,
    fontFamily: "Cormorant Garamond",
    colorTexto: "#2f2a27",
    ...deepClone(overrides),
  };
}

function withHeroCrop(objects, overrides = {}) {
  return objects.map((entry) =>
    entry?.id === "hero-image"
      ? {
          ...entry,
          cropX: 1,
          cropY: 1,
          cropWidth: 2,
          cropHeight: 2,
          ...deepClone(overrides),
        }
      : entry
  );
}

function withPantallaSafeCountdown(objects) {
  return objects.map((entry) =>
    entry?.id === "count-modern"
      ? {
          ...entry,
          x: 388,
          y: 210,
          yNorm: 0.42,
        }
      : entry
  );
}

function withoutLegacyCompatObjects(objects) {
  return objects.filter(
    (entry) => entry?.id !== "count-legacy" && entry?.id !== "icon-legacy"
  );
}

function withDecorationItemsShape(sections) {
  return sections.map((entry) => {
    if (entry?.id !== "section-hero") return entry;

    return {
      ...entry,
      decoracionesFondo: {
        parallax: "soft",
        items: [
          {
            id: "decor-top",
            nombre: "Flor superior",
            src: FIXTURE_PATHS.decorTop,
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
            url: buildGsUrl(FIXTURE_PATHS.decorBottom),
            storagePath: FIXTURE_PATHS.decorBottom,
            x: 580,
            y: 420,
            width: 180,
            height: 120,
            rotation: 0,
            orden: 1,
          },
        ],
      },
    };
  });
}

function createUpdateLifecycleOverrides() {
  return {
    slugPublico: "fixture-publicada",
    ultimaOperacionPublicacion: "update",
    publicationLifecycle: {
      state: "published",
      activePublicSlug: "fixture-publicada",
      firstPublishedAt: FIXED_FIRST_PUBLISHED_AT_ISO,
      expiresAt: FIXED_EXPIRES_AT_ISO,
      lastPublishedAt: FIXED_LAST_PUBLISHED_AT_ISO,
      finalizedAt: null,
    },
  };
}

export function createPublishValidationImageDownloadBuffer() {
  return Buffer.from(CROPPED_IMAGE_BASE64, "base64");
}

export function createRepresentativePublishReadyDraftFixture() {
  const base = createRepresentativePublishNormalizationStageState();
  const baseObjects = withPantallaSafeCountdown(base.objetos);

  return withDraftMetadata({
    objetos: [
      ...withHeroCrop(withoutLegacyCompatObjects(baseObjects)),
      buildRsvpButton(),
      buildGiftButton(),
    ],
    secciones: base.secciones,
    rsvp: {
      enabled: true,
      presetId: "minimal",
      modal: {
        title: "Confirmar asistencia",
        subtitle: "Te esperamos para celebrarlo juntos.",
        submitLabel: "Enviar",
        primaryColor: "#1f6f78",
      },
    },
    gifts: {
      enabled: true,
      introText: "Si desean acompanarnos tambien con un regalo, aqui dejamos los datos.",
      bank: {
        holder: "",
        bank: "",
        alias: "boda.manuel.ana",
        cbu: "0001234500001234500012",
        cuit: "",
      },
      visibility: {
        holder: false,
        bank: false,
        alias: true,
        cbu: true,
        cuit: false,
        giftListLink: false,
      },
      giftListUrl: "",
    },
  });
}

export function createRepresentativeCompatibilityWarningDraftFixture() {
  const base = createRepresentativePublishNormalizationStageState();
  const baseObjects = withPantallaSafeCountdown(base.objetos);

  return withDraftMetadata(
    {
      objetos: [
        ...withHeroCrop(baseObjects, {
          y: 120,
          anclaje: "fullbleed",
        }),
        buildPantallaTitle(),
        buildRsvpButton({
          enlace: "https://wa.me/5491111111111",
        }),
        buildGiftButton({
          enlace: "https://mpago.la/regalo-fixture",
        }),
      ],
      secciones: base.secciones,
      gifts: {
        enabled: true,
        introText: "Pueden elegir el medio que les resulte mas comodo.",
        bank: {
          holder: "",
          bank: "",
          alias: "regalos.fixture",
          cbu: "",
          cuit: "",
        },
        visibility: {
          holder: true,
          bank: false,
          alias: true,
          cbu: false,
          cuit: false,
          giftListLink: true,
        },
        giftListUrl: "",
      },
    },
    createUpdateLifecycleOverrides()
  );
}

export function createRepresentativeGiftNoUsableMethodsDraftFixture() {
  const base = createRepresentativePublishNormalizationStageState();
  const baseObjects = withPantallaSafeCountdown(base.objetos);

  return withDraftMetadata(
    {
      objetos: [
        ...withHeroCrop(withoutLegacyCompatObjects(baseObjects)),
        buildGiftButton(),
      ],
      secciones: base.secciones,
      gifts: {
        enabled: true,
        introText: "Aca van los datos para quienes quieran dejar un regalo.",
        bank: {
          holder: "",
          bank: "",
          alias: "",
          cbu: "",
          cuit: "",
        },
        visibility: {
          holder: true,
          bank: false,
          alias: true,
          cbu: false,
          cuit: false,
          giftListLink: false,
        },
        giftListUrl: "",
      },
    },
    createUpdateLifecycleOverrides()
  );
}

export function createRepresentativeBlockingDraftFixture() {
  const base = createRepresentativePublishNormalizationStageState();
  const baseObjects = withPantallaSafeCountdown(base.objetos);

  return withDraftMetadata(
    {
      objetos: [
        ...withHeroCrop(baseObjects, {
          y: 120,
          anclaje: "fullbleed",
        }),
        buildRsvpButton(),
        buildGiftButton(),
        {
          id: "orphan-text",
          tipo: "texto",
          seccionId: "section-missing",
          x: 40,
          y: 36,
          width: 280,
          texto: "Este texto quedo sin seccion valida",
          fontSize: 24,
        },
      ],
      secciones: withDecorationItemsShape(base.secciones),
      rsvp: {
        enabled: false,
        presetId: "minimal",
      },
      gifts: {
        enabled: false,
        bank: {
          holder: "",
          bank: "",
          alias: "",
          cbu: "",
          cuit: "",
        },
        visibility: {
          holder: false,
          bank: false,
          alias: true,
          cbu: true,
          cuit: false,
          giftListLink: false,
        },
        giftListUrl: "",
      },
    },
    createUpdateLifecycleOverrides()
  );
}
