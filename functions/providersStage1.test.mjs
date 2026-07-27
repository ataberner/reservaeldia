import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const providers = require("./lib/providers/index.js");

function sourceFile(results = []) {
  return providers.parseProviderSourceFile({
    version: 9,
    createdAt: "2026-07-26T18:17:40.871Z",
    reason: "final",
    origin: "https://www.portalcasamientos.com.ar",
    providerUrls: [],
    results,
  });
}

function validRecord(overrides = {}) {
  return {
    categoria: "belleza-novias",
    nombre: "Proveedor Belleza Sintético",
    pagina:
      "https://www.portalcasamientos.com.ar/belleza-novias/proveedor-belleza-ab123/",
    sitio_web: "https://www.instagram.com/provider.stage1.synthetic",
    telefono: "1122223344",
    email: "contacto@example.test | tu@email.com",
    direccion:
      "Avenida Ejemplo 2343, Ramos Mejía, Provincia de Buenos Aires, AR",
    calle: "Avenida Ejemplo 2343",
    localidad: "Ramos Mejía",
    provincia: "Provincia de Buenos Aires",
    codigo_postal: "",
    pais: "AR",
    tipo_schema: "BeautySalon",
    fuente_extraccion: "json-ld | script-json | dom-html",
    ...overrides,
  };
}

test("normalizes source URL and derives stable external identity", () => {
  const normalized = providers.normalizeOriginalProviderUrl(
    "https://www.portalcasamientos.com.ar/belleza-novias/beauty-make-up-YN8NP/?utm=x#top"
  );
  assert.ok(normalized);
  assert.equal(
    normalized.normalized,
    "https://portalcasamientos.com.ar/belleza-novias/beauty-make-up-YN8NP"
  );
  assert.equal(normalized.categorySlug, "belleza-novias");
  assert.equal(normalized.slug, "beauty-make-up");
  assert.equal(normalized.externalId, "yn8np");

  const firstId = providers.createProviderDocumentId(normalized.normalized);
  const secondId = providers.createProviderDocumentId(normalized.normalized);
  assert.equal(firstId, secondId);
  assert.match(firstId, /^pcar_[a-f0-9]{24}$/);
  assert.equal(
    providers.normalizeOriginalProviderUrl("javascript:alert(1)"),
    null
  );
});

test("extracts technical IDs from real provider paths with sufficient evidence", () => {
  const cases = [
    {
      url: "https://www.portalcasamientos.com.ar/belleza-novias/a-flor-de-piel-qon2o/",
      slug: "a-flor-de-piel",
      externalId: "qon2o",
    },
    {
      url: "https://www.portalcasamientos.com.ar/belleza-novias/adara-bienestar-y-belleza-rmlgc/",
      slug: "adara-bienestar-y-belleza",
      externalId: "rmlgc",
    },
    {
      url: "https://www.portalcasamientos.com.ar/musica-bodas/la-tia-cuqui-70427/",
      slug: "la-tia-cuqui",
      externalId: "70427",
    },
  ];

  for (const entry of cases) {
    const normalized = providers.normalizeOriginalProviderUrl(entry.url);
    assert.ok(normalized);
    assert.equal(normalized.slug, entry.slug);
    assert.equal(normalized.externalId, entry.externalId);
  }
});

test("never interprets navigation words as external IDs", () => {
  const navigationSlugs = [
    "buenos-aires",
    "zona-norte",
    "zona-oeste",
    "rio-negro",
    "la-pampa",
    "tierra-del-fuego",
  ];

  for (const navigationSlug of navigationSlugs) {
    const normalized = providers.normalizeOriginalProviderUrl(
      `https://www.portalcasamientos.com.ar/belleza-novias/${navigationSlug}/`
    );
    assert.ok(normalized);
    assert.equal(normalized.slug, navigationSlug);
    assert.equal(normalized.externalId, null);
  }

  const naturalWordSuffix = providers.normalizeOriginalProviderUrl(
    "https://www.portalcasamientos.com.ar/bodas-playa/servicio-playa/"
  );
  assert.ok(naturalWordSuffix);
  assert.equal(naturalWordSuffix.slug, "servicio-playa");
  assert.equal(naturalWordSuffix.externalId, null);
});

test("splits emails without silently repairing invalid values", () => {
  const normalized = providers.normalizeEmails(
    "VALID@example.com | tu@email.com; bad@, valid@example.com,other@example.org"
  );
  assert.equal(normalized.principal, "valid@example.com");
  assert.deepEqual(normalized.alternativos, ["other@example.org"]);
  assert.deepEqual(
    normalized.invalidos.map((entry) => entry.reason),
    ["placeholder", "invalid"]
  );
});

test("normalizes only safe phone forms without inventing prefixes", () => {
  assert.deepEqual(providers.normalizePhone("1122223344", "AR"), {
    original: "1122223344",
    normalized: "+541122223344",
    status: "normalized",
    removedLeadingExcelApostrophe: false,
  });
  assert.equal(
    providers.normalizePhone("1122223344", "UY").status,
    "unsafe_local_format"
  );
  assert.equal(
    providers.normalizePhone("+598 99 123 456", "UY").normalized,
    "+59899123456"
  );
});

test("maps a safely normalized Argentine source phone to WhatsApp", () => {
  const mapped = providers.mapPortalProviderRecord(validRecord(), {
    sourceFile: sourceFile(),
    sourceFileName: "providers.json",
  });

  assert.equal(mapped.document.contacto.telefonoOriginal, "1122223344");
  assert.equal(
    mapped.document.contacto.telefonoNormalizado,
    "+541122223344"
  );
  assert.equal(mapped.document.contacto.whatsapp, "+541122223344");
  assert.deepEqual(providers.validateProveedor(mapped.document), []);
});

test("maps a valid E.164 source phone to normalized phone and WhatsApp", () => {
  const mapped = providers.mapPortalProviderRecord(
    validRecord({
      telefono: "+598 99 123 456",
      pais: "UY",
    }),
    {
      sourceFile: sourceFile(),
      sourceFileName: "providers.json",
    }
  );

  assert.equal(mapped.document.contacto.telefonoOriginal, "+598 99 123 456");
  assert.equal(
    mapped.document.contacto.telefonoNormalizado,
    "+59899123456"
  );
  assert.equal(mapped.document.contacto.whatsapp, "+59899123456");
  assert.deepEqual(providers.validateProveedor(mapped.document), []);
});

test("preserves an ambiguous source phone without normalized phone or WhatsApp", () => {
  const mapped = providers.mapPortalProviderRecord(
    validRecord({ telefono: "1234567", pais: "AR" }),
    {
      sourceFile: sourceFile(),
      sourceFileName: "providers.json",
    }
  );

  assert.equal(mapped.document.contacto.telefonoOriginal, "1234567");
  assert.equal(mapped.document.contacto.telefonoNormalizado, null);
  assert.equal(mapped.document.contacto.whatsapp, null);
  assert.deepEqual(providers.validateProveedor(mapped.document), []);
});

test("maps an empty source phone to null contact phone fields", () => {
  const mapped = providers.mapPortalProviderRecord(
    validRecord({ telefono: "" }),
    {
      sourceFile: sourceFile(),
      sourceFileName: "providers.json",
    }
  );

  assert.equal(mapped.document.contacto.telefonoOriginal, null);
  assert.equal(mapped.document.contacto.telefonoNormalizado, null);
  assert.equal(mapped.document.contacto.whatsapp, null);
  assert.deepEqual(providers.validateProveedor(mapped.document), []);
});

test("classifies provider website values without treating media as websites", () => {
  assert.equal(
    providers.classifyProviderUrl("https://instagram.com/example").tipo,
    "instagram"
  );
  assert.equal(
    providers.classifyProviderUrl("https://cdn.example.com/photo.avif").tipo,
    "image"
  );
  assert.equal(
    providers.classifyProviderUrl(
      "https://portalcasamientos.com.ar/media/photo.jpg"
    ).tipo,
    "portal_media"
  );
  assert.equal(
    providers.classifyProviderUrl("https://www.google.com/search?q=salon").tipo,
    "google_search"
  );
  assert.equal(
    providers.classifyProviderUrl("https://example.com").tipo,
    "website"
  );
});

test("eligibility rejects nested navigation, duplicates, and weak data", () => {
  assert.equal(
    providers.evaluateProviderEligibility(
      validRecord({
        pagina:
          "https://portalcasamientos.com.ar/belleza-novias/buenos-aires/",
      })
    ).eligible,
    false
  );
  assert.equal(
    providers.evaluateProviderEligibility(
      validRecord({
        pagina:
          "https://portalcasamientos.com.ar/belleza-novias/beauty-make-up/",
      })
    ).eligible,
    true
  );
  assert.ok(
    providers
      .evaluateProviderEligibility(validRecord(), { isDuplicate: true })
      .reasons.some((reason) => reason.code === "duplicate_url")
  );
  assert.ok(
    providers
      .evaluateProviderEligibility(
        validRecord({
          telefono: "",
          email: "",
          sitio_web: "",
          direccion: "",
          calle: "",
          localidad: "",
          tipo_schema: "",
        })
      )
      .reasons.some((reason) => reason.code === "insufficient_data")
  );
  assert.equal(
    providers.evaluateProviderEligibility(validRecord()).eligible,
    true
  );
});

test("URL identity stays idempotent when an eligible provider has no external ID", () => {
  const pagina =
    "https://portalcasamientos.com.ar/belleza-novias/beauty-make-up/";
  const normalized = providers.normalizeOriginalProviderUrl(pagina);
  assert.ok(normalized);
  assert.equal(normalized.externalId, null);
  assert.equal(
    providers.createProviderDocumentId(normalized.normalized),
    providers.createProviderDocumentId(normalized.normalized)
  );
  assert.equal(
    providers.evaluateProviderEligibility(validRecord({ pagina })).eligible,
    true
  );
});

test("maps an eligible record to the required invisible import contract", () => {
  const mapped = providers.mapPortalProviderRecord(validRecord(), {
    sourceFile: sourceFile([validRecord()]),
    sourceFileName: "providers-private.json",
  });

  assert.match(mapped.id, /^pcar_[a-f0-9]{24}$/);
  assert.equal(mapped.document.schemaVersion, 2);
  assert.equal(mapped.document.estado, "importado");
  assert.equal(mapped.document.activo, true);
  assert.equal(mapped.document.visible, false);
  assert.equal(mapped.document.validacion.estado, "no_validado");
  assert.equal(mapped.document.propietario.reclamado, false);
  assert.ok(mapped.document.fuente.importadoEn instanceof Date);
  assert.ok(mapped.document.creadoEn instanceof Date);
  assert.ok(mapped.document.actualizadoEn instanceof Date);
  assert.equal(
    mapped.document.fuente.importadoEn.getTime(),
    mapped.document.creadoEn.getTime()
  );
  assert.equal(
    mapped.document.creadoEn.getTime(),
    mapped.document.actualizadoEn.getTime()
  );
  assert.deepEqual(mapped.document.revisionManual, {
    requerida: false,
    motivos: [],
    revisadaEn: null,
    revisadaPor: null,
    notas: null,
  });
  assert.equal(mapped.document.categoriaPrincipalId, "belleza-novias");
  assert.deepEqual(mapped.document.categoriaIds, ["belleza-novias"]);
  assert.equal(mapped.document.contacto.email, "contacto@example.test");
  assert.equal(mapped.document.contacto.telefonoOriginal, "1122223344");
  assert.equal(
    mapped.document.contacto.telefonoNormalizado,
    "+541122223344"
  );
  assert.equal(mapped.document.contacto.whatsapp, "+541122223344");
  assert.equal(
    mapped.document.redesSociales.instagram,
    "https://www.instagram.com/provider.stage1.synthetic"
  );
  assert.equal(mapped.document.ubicacion.nivel1Codigo, "AR-B");
  assert.equal(mapped.document.ubicacion.nivel2Nombre, null);
  assert.equal(mapped.document.ubicacion.ciudad, "Ramos Mejía");
  assert.equal(mapped.document.ubicacion.regionMetropolitana, null);
  assert.equal(mapped.document.ubicacion.calle, "Avenida Ejemplo");
  assert.equal(mapped.document.ubicacion.numero, "2343");
  assert.deepEqual(mapped.document.importacion, {
    version: 1,
    datosImportados: true,
    descripcionImportada: false,
    portadaImportada: false,
    galeriaImportada: false,
    cantidadImagenes: 0,
    ultimoIntentoEn: null,
    ultimoError: null,
    completadaEn: null,
  });
  assert.deepEqual(providers.validateProveedor(mapped.document), []);

  const invalidVisible = {
    ...mapped.document,
    visible: true,
  };
  assert.ok(
    providers
      .validateProveedor(invalidVisible)
      .some((issue) => issue.path === "visible")
  );
});

test("unknown categories remain unassigned and are not invented", () => {
  const mapped = providers.mapPortalProviderRecord(
    validRecord({ categoria: "categoria-no-revisada" }),
    {
      sourceFile: sourceFile(),
      sourceFileName: "providers.json",
    }
  );
  assert.equal(mapped.document.categoriaPrincipalId, null);
  assert.deepEqual(mapped.document.categoriaIds, []);
  assert.equal(mapped.diagnostics.originalCategory, "categoria-no-revisada");
  assert.deepEqual(mapped.document.revisionManual.motivos, [
    "categoria_ambigua",
  ]);
});

test("category decisions apply the definitive mappings and container reviews", () => {
  assert.equal(Object.keys(providers.PROVIDER_CATEGORY_MAP).length, 25);
  assert.equal(
    Object.keys(providers.PROVIDER_CATEGORY_REVIEW_REQUIRED).length,
    4
  );
  assert.deepEqual(
    Object.keys(providers.PROVIDER_CATEGORY_MAP).filter((category) =>
      Object.hasOwn(providers.PROVIDER_CATEGORY_REVIEW_REQUIRED, category)
    ),
    []
  );
  assert.deepEqual(providers.mapProviderCategory("musica-bodas"), {
    categoriaId: "musica-bodas",
  });
  assert.deepEqual(providers.mapProviderCategory("foto-video"), {
    categoriaId: "foto-video",
  });
  assert.deepEqual(providers.mapProviderCategory("novios"), {
    categoriaId: "trajes-novio",
  });
  assert.deepEqual(providers.mapProviderCategory("proveedores-integrales"), {
    categoriaId: "proveedores-integrales",
  });
  assert.deepEqual(
    providers.getProviderCategoryDecision("experiencias-adicionales"),
    {
      status: "review_required",
      categoriaId: null,
      reviewReason:
        "Categoría contenedora de experiencias y servicios heterogéneos.",
      manualReviewReason:
        "categoria_contenedora_experiencias_adicionales",
    }
  );
  assert.equal(providers.mapProviderCategory("experiencias-adicionales"), null);
  assert.equal(
    providers.getProviderCategoryDecision("categoria-no-revisada").status,
    "unreviewed"
  );
});

test("container categories stay unassigned and require their specific review", () => {
  const novias = providers.mapPortalProviderRecord(
    validRecord({
      categoria: "novias",
      pagina:
        "https://portalcasamientos.com.ar/novias/proveedor-novias-ab123/",
    }),
    {
      sourceFile: sourceFile(),
      sourceFileName: "providers.json",
    }
  );
  assert.equal(novias.document.categoriaPrincipalId, null);
  assert.deepEqual(novias.document.categoriaIds, []);
  assert.equal(novias.document.fuente.categoriaOriginal, "novias");
  assert.deepEqual(novias.document.revisionManual.motivos, [
    "categoria_contenedora_novias",
  ]);

  const experiencias = providers.mapPortalProviderRecord(
    validRecord({
      categoria: "experiencias-adicionales",
      pagina:
        "https://portalcasamientos.com.ar/experiencias-adicionales/proveedor-experiencias-cd456/",
    }),
    {
      sourceFile: sourceFile(),
      sourceFileName: "providers.json",
    }
  );
  assert.equal(experiencias.document.categoriaPrincipalId, null);
  assert.deepEqual(experiencias.document.categoriaIds, []);
  assert.equal(
    experiencias.document.fuente.categoriaOriginal,
    "experiencias-adicionales"
  );
  assert.deepEqual(experiencias.document.revisionManual.motivos, [
    "categoria_contenedora_experiencias_adicionales",
  ]);
});

test("novios and proveedores integrales map to their definitive categories", () => {
  const novios = providers.mapPortalProviderRecord(
    validRecord({
      categoria: "novios",
      pagina:
        "https://portalcasamientos.com.ar/novios/trajes-de-novio-ab123/",
    }),
    {
      sourceFile: sourceFile(),
      sourceFileName: "providers.json",
    }
  );
  assert.equal(novios.document.categoriaPrincipalId, "trajes-novio");
  assert.deepEqual(novios.document.categoriaIds, ["trajes-novio"]);
  assert.equal(novios.document.revisionManual.requerida, false);

  const integrales = providers.mapPortalProviderRecord(
    validRecord({
      categoria: "proveedores-integrales",
      pagina:
        "https://portalcasamientos.com.ar/proveedores-integrales/integral-cd456/",
    }),
    {
      sourceFile: sourceFile(),
      sourceFileName: "providers.json",
    }
  );
  assert.equal(
    integrales.document.categoriaPrincipalId,
    "proveedores-integrales"
  );
  assert.deepEqual(integrales.document.categoriaIds, [
    "proveedores-integrales",
  ]);
  assert.equal(integrales.document.revisionManual.requerida, false);
});

test("aggregate categories reject navigation but retain real providers for review", () => {
  for (const category of [
    "bodas-playa",
    "recepciones-quintas-hoteles-estancias-playa",
  ]) {
    const navigationRecord = validRecord({
      categoria: category,
      pagina:
        `https://portalcasamientos.com.ar/${category}/buenos-aires/`,
    });
    const navigationEligibility =
      providers.evaluateProviderEligibility(navigationRecord);
    assert.equal(navigationEligibility.eligible, false);
    assert.ok(
      navigationEligibility.reasons.some(
        (reason) => reason.code === "navigation_or_region_page"
      )
    );
  }

  const realRecord = validRecord({
    categoria: "bodas-playa",
    pagina:
      "https://portalcasamientos.com.ar/bodas-playa/proveedor-real-ab123/",
  });
  assert.equal(providers.evaluateProviderEligibility(realRecord).eligible, true);
  const mapped = providers.mapPortalProviderRecord(realRecord, {
    sourceFile: sourceFile(),
    sourceFileName: "providers.json",
  });
  assert.equal(mapped.document.categoriaPrincipalId, null);
  assert.deepEqual(mapped.document.categoriaIds, []);
  assert.deepEqual(mapped.document.revisionManual.motivos, [
    "categoria_ambigua",
  ]);
});

test("manual review reasons combine deterministically without duplicates", () => {
  const mapped = providers.mapPortalProviderRecord(
    validRecord({
      categoria: "novias",
      pagina:
        "https://portalcasamientos.com.ar/novias/proveedor-sin-id/",
    }),
    {
      sourceFile: sourceFile(),
      sourceFileName: "providers.json",
      manualReviewReasons: [
        "posible_duplicado_nombre",
        "categoria_contenedora_novias",
        "posible_duplicado_nombre",
      ],
    }
  );

  assert.deepEqual(mapped.document.revisionManual, {
    requerida: true,
    motivos: [
      "posible_duplicado_nombre",
      "categoria_contenedora_novias",
      "sin_id_externo",
    ],
    revisadaEn: null,
    revisadaPor: null,
    notas: null,
  });
});

test("runtime validation enforces the manual review contract", () => {
  const mapped = providers.mapPortalProviderRecord(validRecord(), {
    sourceFile: sourceFile(),
    sourceFileName: "providers.json",
  });

  const missingReview = { ...mapped.document };
  delete missingReview.revisionManual;
  assert.ok(
    providers
      .validateProveedor(missingReview)
      .some((issue) => issue.path === "revisionManual")
  );

  const duplicateReasons = {
    ...mapped.document,
    revisionManual: {
      ...mapped.document.revisionManual,
      requerida: true,
      motivos: ["contacto_dudoso", "contacto_dudoso"],
    },
  };
  assert.ok(
    providers
      .validateProveedor(duplicateReasons)
      .some(
        (issue) =>
          issue.path === "revisionManual.motivos" &&
          issue.message.includes("duplicados")
      )
  );

  const invalidReason = {
    ...mapped.document,
    revisionManual: {
      ...mapped.document.revisionManual,
      requerida: true,
      motivos: ["motivo_inventado"],
    },
  };
  assert.ok(
    providers
      .validateProveedor(invalidReason)
      .some((issue) => issue.path === "revisionManual.motivos")
  );
});

test("runtime validation enforces safe imported WhatsApp mapping", () => {
  const mapped = providers.mapPortalProviderRecord(validRecord(), {
    sourceFile: sourceFile(),
    sourceFileName: "providers.json",
  });
  const missingImportedWhatsapp = {
    ...mapped.document,
    contacto: {
      ...mapped.document.contacto,
      whatsapp: null,
    },
  };
  assert.ok(
    providers
      .validateProveedor(missingImportedWhatsapp)
      .some(
        (issue) =>
          issue.path === "contacto.whatsapp" &&
          issue.message.includes("telefonoNormalizado")
      )
  );

  const invalidWhatsapp = {
    ...mapped.document,
    contacto: {
      ...mapped.document.contacto,
      telefonoNormalizado: "1122223344",
      whatsapp: "1122223344",
    },
  };
  assert.ok(
    providers
      .validateProveedor(invalidWhatsapp)
      .some(
        (issue) =>
          issue.path === "contacto.whatsapp" &&
          issue.message.includes("E.164")
      )
  );
});

test("builds stable Storage paths and rejects traversal", () => {
  const providerId = providers.createProviderDocumentId(
    "https://portalcasamientos.com.ar/a/provider-abc12"
  );
  assert.equal(
    providers.buildProviderCoverStoragePath(providerId, ".JPEG"),
    `proveedores/${providerId}/portada/portada-original.jpeg`
  );
  assert.equal(
    providers.buildProviderGalleryStoragePath(providerId, "img_01", "webp"),
    `proveedores/${providerId}/galeria/img_01.webp`
  );
  assert.throws(
    () =>
      providers.buildProviderGalleryStoragePath(
        providerId,
        "../escape",
        "jpg"
      ),
    /Invalid provider image ID/
  );
});

test("security rules isolate provider routes from authenticated fallbacks", () => {
  const firestoreRules = readFileSync(
    new URL("../firestore.rules", import.meta.url),
    "utf8"
  );
  const storageRules = readFileSync(
    new URL("../storage.rules", import.meta.url),
    "utf8"
  );

  assert.match(firestoreRules, /match \/proveedores\/\{proveedorId\}/);
  assert.match(
    firestoreRules,
    /resource\.data\.estado == "publicado"[\s\S]*resource\.data\.activo == true[\s\S]*resource\.data\.visible == true/
  );
  assert.match(firestoreRules, /collection != "proveedores"/);
  assert.match(firestoreRules, /allow create, update: if isAdmin\(\)/);
  assert.match(firestoreRules, /"revisionManual"/);
  assert.match(firestoreRules, /"posible_duplicado_nombre"/);
  assert.match(storageRules, /match \/proveedores\/\{proveedorId\}\/portada/);
  assert.match(storageRules, /request\.resource\.size <= 15 \* 1024 \* 1024/);
  assert.match(storageRules, /image\/\(jpeg\|png\|webp\|gif\|avif\)/);
  assert.match(storageRules, /topLevel != "proveedores"/);
});
