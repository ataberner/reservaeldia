function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createRepresentativeTemplateFixture({ previewUrl = null } = {}) {
  return {
    id: "template-preview-fixture",
    nombre: "Boda Floral",
    portada: "https://images.example.com/template-cover.jpg",
    preview: previewUrl ? { previewUrl } : {},
    defaults: {
      event_name: "Ana y Luis",
      event_date: "2026-12-20",
      welcome_copy: "Nos vemos pronto",
      gallery_images: [],
      rsvp_title: "Confirma asistencia",
    },
    fieldsSchema: [
      {
        key: "event_name",
        label: "Nombre del evento",
        type: "text",
        applyTargets: [
          {
            scope: "objeto",
            id: "title-main",
            path: "texto",
            mode: "set",
          },
        ],
      },
      {
        key: "event_date",
        label: "Fecha del evento",
        type: "date",
        applyTargets: [
          {
            scope: "objeto",
            id: "date-main",
            path: "texto",
            mode: "set",
            transform: {
              kind: "date_to_text",
              preset: "event_date_long_es_ar",
            },
          },
          {
            scope: "objeto",
            id: "countdown-main",
            path: "fechaObjetivo",
            mode: "set",
            transform: {
              kind: "date_to_countdown_iso",
            },
          },
        ],
      },
      {
        key: "welcome_copy",
        label: "Texto de bienvenida",
        type: "textarea",
      },
      {
        key: "gallery_images",
        label: "Galeria",
        type: "images",
        applyTargets: [
          {
            scope: "objeto",
            id: "gallery-main",
            path: "cells",
            mode: "set",
          },
        ],
      },
      {
        key: "rsvp_title",
        label: "Titulo RSVP",
        type: "text",
        applyTargets: [
          {
            scope: "rsvp",
            path: "title",
            mode: "set",
          },
        ],
      },
    ],
    objetos: [
      {
        id: "title-main",
        tipo: "texto",
        texto: "Ana y Luis",
        x: 110,
        y: 70,
        fontSize: 42,
        fontFamily: "Arial",
        seccionId: "section-hero",
      },
      {
        id: "date-main",
        tipo: "texto",
        texto: "20 de diciembre de 2026",
        x: 110,
        y: 140,
        fontSize: 24,
        fontFamily: "Arial",
        seccionId: "section-hero",
      },
      {
        id: "welcome-copy",
        tipo: "texto",
        texto: "Nos vemos pronto",
        x: 110,
        y: 210,
        fontSize: 20,
        fontFamily: "Arial",
        seccionId: "section-hero",
      },
      {
        id: "countdown-main",
        tipo: "countdown",
        fechaObjetivo: "2026-12-20T00:00:00.000Z",
        x: 100,
        y: 300,
        seccionId: "section-hero",
      },
      {
        id: "gallery-main",
        tipo: "galeria",
        x: 100,
        y: 360,
        seccionId: "section-hero",
        cells: [
          {
            mediaUrl: "https://images.example.com/gallery-default-1.jpg",
            fit: "cover",
            bg: "#f3f4f6",
          },
          {
            mediaUrl: "https://images.example.com/gallery-default-2.jpg",
            fit: "cover",
            bg: "#f3f4f6",
          },
          {
            mediaUrl: "https://images.example.com/gallery-default-3.jpg",
            fit: "cover",
            bg: "#f3f4f6",
          },
        ],
      },
    ],
    secciones: [
      {
        id: "section-hero",
        orden: 1,
        altura: 720,
        altoModo: "fijo",
      },
    ],
    rsvp: {
      enabled: true,
      title: "Confirma asistencia",
      subtitle: "Te esperamos",
      buttonText: "Responder",
      primaryColor: "#773dbe",
    },
    gifts: null,
  };
}

export function createRepresentativeDraftFixture() {
  const template = createRepresentativeTemplateFixture();
  return {
    objetos: deepClone(template.objetos),
    secciones: deepClone(template.secciones),
    rsvp: deepClone(template.rsvp),
    gifts: null,
  };
}

export function createRepresentativePersonalizationInput() {
  return {
    rawValues: {
      event_name: "Mara y Nico",
      event_date: "2027-01-05",
      welcome_copy: "Celebremos juntos",
      gallery_images: [],
      rsvp_title: "Avisanos si venis",
    },
    touchedKeys: [
      "event_name",
      "event_date",
      "welcome_copy",
      "gallery_images",
      "rsvp_title",
    ],
    galleryUrlsByField: {
      gallery_images: [
        "https://images.example.com/gallery-upload-1.jpg",
        "https://images.example.com/gallery-upload-2.jpg",
      ],
    },
  };
}

export function createRepresentativePreviewTextPositions() {
  return {
    "title-main": {
      x: 222,
      y: 144,
      source: "fixture",
    },
  };
}
