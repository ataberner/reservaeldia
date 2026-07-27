import type {
  CategoriaProveedor,
  MotivoRevisionProveedor,
} from "./types";

export const PROVIDERS_COLLECTION = "proveedores";
export const PROVIDER_CATEGORIES_COLLECTION = "categorias_proveedores";
export const PROVIDER_SCHEMA_VERSION = 2;
export const PROVIDER_IMPORT_VERSION = 1;
export const PROVIDER_SOURCE_HOST = "portalcasamientos.com.ar";
export const PROVIDER_ID_PREFIX = "pcar_";
export const PROVIDER_ID_HASH_HEX_LENGTH = 24;

export const PROVIDER_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
export const PROVIDER_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
] as const;

export type ProviderCategoryMapping = {
  categoriaId: string;
};

export type ProviderCategoryCatalogEntry = Readonly<
  {
    documentId: string;
  } & Omit<
    CategoriaProveedor<Date>,
    "creadoEn" | "actualizadoEn"
  >
>;

/**
 * Canonical deploy manifest for the operational provider-category catalog.
 * Firestore remains the runtime authority after the explicit idempotent seed.
 * Timestamps are intentionally created only by the persistence script.
 */
export const PROVIDER_CATEGORY_CATALOG: ReadonlyArray<
  ProviderCategoryCatalogEntry
> = Object.freeze(
  [
    {
      documentId: "belleza-novias",
      nombre: "Belleza para novias",
      slug: "belleza-novias",
      descripcion:
        "Servicios de maquillaje, peinado y belleza para novias.",
      activa: true,
      orden: 10,
      icono: null,
      categoriaPadreId: null,
    },
    {
      documentId: "foto-video",
      nombre: "Foto y video",
      slug: "foto-video",
      descripcion:
        "Servicios profesionales de fotografía y video para casamientos.",
      activa: true,
      orden: 20,
      icono: null,
      categoriaPadreId: null,
    },
    {
      documentId: "musica-bodas",
      nombre: "Música para bodas",
      slug: "musica-bodas",
      descripcion:
        "Música en vivo y servicios musicales para casamientos.",
      activa: true,
      orden: 30,
      icono: null,
      categoriaPadreId: null,
    },
    {
      documentId: "ambientacion",
      nombre: "Ambientación",
      slug: "ambientacion",
      descripcion:
        "Servicios de ambientación y decoración para eventos.",
      activa: true,
      orden: 40,
      icono: null,
      categoriaPadreId: null,
    },
    {
      documentId: "catering",
      nombre: "Catering",
      slug: "catering",
      descripcion:
        "Servicios de catering y gastronomía para eventos.",
      activa: true,
      orden: 50,
      icono: null,
      categoriaPadreId: null,
    },
    {
      documentId: "tecnica-dj",
      nombre: "Técnica y DJ",
      slug: "tecnica-dj",
      descripcion:
        "Servicios de sonido, iluminación, técnica y DJ para eventos.",
      activa: true,
      orden: 60,
      icono: null,
      categoriaPadreId: null,
    },
    {
      documentId: "wedding-planner",
      nombre: "Wedding planner",
      slug: "wedding-planner",
      descripcion:
        "Planificación, coordinación y organización integral de casamientos.",
      activa: true,
      orden: 70,
      icono: null,
      categoriaPadreId: null,
    },
    {
      documentId: "atelier-casa-de-novias",
      nombre: "Ateliers y casas de novias",
      slug: "atelier-casa-de-novias",
      descripcion:
        "Ateliers, diseñadores y casas especializadas en vestidos de novia.",
      activa: true,
      orden: 80,
      icono: null,
      categoriaPadreId: null,
    },
    {
      documentId: "barras-moviles",
      nombre: "Barras móviles",
      slug: "barras-moviles",
      descripcion:
        "Servicios de barras móviles y coctelería para eventos.",
      activa: true,
      orden: 90,
      icono: null,
      categoriaPadreId: null,
    },
    {
      documentId: "salones-fiestas",
      nombre: "Salones de fiestas",
      slug: "salones-fiestas",
      descripcion:
        "Salones y espacios destinados a fiestas y recepciones.",
      activa: true,
      orden: 100,
      icono: null,
      categoriaPadreId: null,
    },
    {
      documentId: "accesorios-novia",
      nombre: "Accesorios para novia",
      slug: "accesorios-novia",
      descripcion: "Accesorios y complementos para novias.",
      activa: true,
      orden: 110,
      icono: null,
      categoriaPadreId: null,
    },
    {
      documentId: "alquiler-mobiliario",
      nombre: "Alquiler de mobiliario",
      slug: "alquiler-mobiliario",
      descripcion:
        "Alquiler de mobiliario y equipamiento para eventos.",
      activa: true,
      orden: 120,
      icono: null,
      categoriaPadreId: null,
    },
    {
      documentId: "tortas-de-boda",
      nombre: "Tortas de boda",
      slug: "tortas-de-boda",
      descripcion: "Pastelería y tortas para casamientos.",
      activa: true,
      orden: 130,
      icono: null,
      categoriaPadreId: null,
    },
    {
      documentId: "quintas",
      nombre: "Quintas",
      slug: "quintas",
      descripcion:
        "Quintas para fiestas, recepciones y casamientos.",
      activa: true,
      orden: 140,
      icono: null,
      categoriaPadreId: null,
    },
    {
      documentId: "traslados",
      nombre: "Traslados",
      slug: "traslados",
      descripcion:
        "Servicios de traslado y transporte para casamientos.",
      activa: true,
      orden: 150,
      icono: null,
      categoriaPadreId: null,
    },
    {
      documentId: "estancias",
      nombre: "Estancias",
      slug: "estancias",
      descripcion:
        "Estancias para fiestas, recepciones y casamientos.",
      activa: true,
      orden: 160,
      icono: null,
      categoriaPadreId: null,
    },
    {
      documentId: "trajes-fiesta",
      nombre: "Trajes de fiesta",
      slug: "trajes-fiesta",
      descripcion: "Indumentaria y trajes de fiesta.",
      activa: true,
      orden: 170,
      icono: null,
      categoriaPadreId: null,
    },
    {
      documentId: "hoteles",
      nombre: "Hoteles",
      slug: "hoteles",
      descripcion:
        "Hoteles para celebraciones, recepciones y alojamiento.",
      activa: true,
      orden: 180,
      icono: null,
      categoriaPadreId: null,
    },
    {
      documentId: "alianzas",
      nombre: "Alianzas",
      slug: "alianzas",
      descripcion:
        "Joyerías y proveedores de alianzas de casamiento.",
      activa: true,
      orden: 190,
      icono: null,
      categoriaPadreId: null,
    },
    {
      documentId: "restaurantes",
      nombre: "Restaurantes",
      slug: "restaurantes",
      descripcion:
        "Restaurantes para celebraciones y recepciones.",
      activa: true,
      orden: 200,
      icono: null,
      categoriaPadreId: null,
    },
    {
      documentId: "trajes-madrina",
      nombre: "Trajes de madrina",
      slug: "trajes-madrina",
      descripcion: "Trajes y vestidos para madrinas.",
      activa: true,
      orden: 210,
      icono: null,
      categoriaPadreId: null,
    },
    {
      documentId: "trajes-novio",
      nombre: "Trajes de novio",
      slug: "trajes-novio",
      descripcion: "Trajes e indumentaria para novios.",
      activa: true,
      orden: 220,
      icono: null,
      categoriaPadreId: null,
    },
    {
      documentId: "zapatos",
      nombre: "Zapatos",
      slug: "zapatos",
      descripcion: "Calzado para novias, novios e invitados.",
      activa: true,
      orden: 230,
      icono: null,
      categoriaPadreId: null,
    },
    {
      documentId: "proveedores-integrales",
      nombre: "Proveedores integrales",
      slug: "proveedores-integrales",
      descripcion:
        "Proveedores que ofrecen múltiples servicios coordinados para casamientos.",
      activa: true,
      orden: 240,
      icono: null,
      categoriaPadreId: null,
    },
  ].map((entry) => Object.freeze(entry))
);

/**
 * Confirmed one-to-one mappings from the source taxonomy. Broad or aggregate
 * categories are intentionally excluded until an operator reviews their
 * intended internal meaning.
 */
export const PROVIDER_CATEGORY_MAP: Readonly<
  Record<string, ProviderCategoryMapping>
> = Object.freeze(
  Object.fromEntries([
    ...PROVIDER_CATEGORY_CATALOG.map(({ documentId }) => [
      documentId,
      Object.freeze({ categoriaId: documentId }),
    ]),
    [
      "novios",
      Object.freeze({ categoriaId: "trajes-novio" }),
    ],
  ])
);

export const PROVIDER_CATEGORY_REVIEW_REQUIRED: Readonly<
  Record<
    string,
    {
      reviewReason: string;
      manualReviewReason: MotivoRevisionProveedor;
    }
  >
> = Object.freeze({
  "experiencias-adicionales": Object.freeze({
    reviewReason:
      "Categoría contenedora de experiencias y servicios heterogéneos.",
    manualReviewReason:
      "categoria_contenedora_experiencias_adicionales",
  }),
  novias: Object.freeze({
    reviewReason:
      "Categoría contenedora de rubros destinados a novias.",
    manualReviewReason: "categoria_contenedora_novias",
  }),
  "bodas-playa": Object.freeze({
    reviewReason:
      "Categoría agregadora que puede representar navegación o un proveedor real ambiguo.",
    manualReviewReason: "categoria_ambigua",
  }),
  "recepciones-quintas-hoteles-estancias-playa": Object.freeze({
    reviewReason:
      "Taxonomía agregada que no debe convertirse automáticamente en un único rubro.",
    manualReviewReason: "categoria_ambigua",
  }),
});

export type ProviderCategoryDecision = {
  status: "confirmed" | "review_required" | "unreviewed";
  categoriaId: string | null;
  reviewReason: string | null;
  manualReviewReason: MotivoRevisionProveedor | null;
};

export function mapProviderCategory(
  originalCategory: string | null
): ProviderCategoryMapping | null {
  if (!originalCategory) return null;
  return PROVIDER_CATEGORY_MAP[originalCategory] || null;
}

export function getProviderCategoryDecision(
  originalCategory: string | null
): ProviderCategoryDecision {
  if (!originalCategory) {
    return {
      status: "unreviewed",
      categoriaId: null,
      reviewReason: "El registro no contiene categoría original.",
      manualReviewReason: "categoria_ambigua",
    };
  }

  const mapping = mapProviderCategory(originalCategory);
  if (mapping) {
    return {
      status: "confirmed",
      categoriaId: mapping.categoriaId,
      reviewReason: null,
      manualReviewReason: null,
    };
  }

  const reviewConfiguration =
    PROVIDER_CATEGORY_REVIEW_REQUIRED[originalCategory];
  if (reviewConfiguration) {
    return {
      status: "review_required",
      categoriaId: null,
      reviewReason: reviewConfiguration.reviewReason,
      manualReviewReason: reviewConfiguration.manualReviewReason,
    };
  }

  return {
    status: "unreviewed",
    categoriaId: null,
    reviewReason: "Categoría original todavía no revisada.",
    manualReviewReason: "categoria_ambigua",
  };
}

/**
 * Explicit source navigation taxonomy. These values can appear as the final
 * segment of `/{categoria}/{region}` and must never be interpreted as a
 * provider's five-character technical identifier.
 */
export const PROVIDER_NAVIGATION_SLUGS: ReadonlySet<string> = new Set([
  "buenos-aires",
  "buenos-aires-interior",
  "buenos-aires-costa-atlantica",
  "buenos-aires-zona-norte",
  "buenos-aires-zona-oeste",
  "zona-norte",
  "zona-oeste",
  "capital-federal",
  "ciudad-autonoma-de-buenos-aires",
  "catamarca",
  "chaco",
  "chubut",
  "cordoba",
  "corrientes",
  "entre-rios",
  "formosa",
  "jujuy",
  "la-pampa",
  "la-rioja",
  "mendoza",
  "misiones",
  "neuquen",
  "rio-negro",
  "salta",
  "san-juan",
  "san-luis",
  "santa-cruz",
  "santa-fe",
  "santiago-del-estero",
  "tierra-del-fuego",
  "tucuman",
]);

export function isProviderNavigationSlug(value: string | null): boolean {
  return Boolean(value && PROVIDER_NAVIGATION_SLUGS.has(value));
}
