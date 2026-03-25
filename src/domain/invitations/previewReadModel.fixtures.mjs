export const draftPreviewFixtures = [
  {
    id: "draft-missing-portada-uses-thumbnail",
    draft: {
      thumbnailUrl: "https://cdn.example.com/thumb.webp",
      portada: "",
    },
    options: { includePlaceholder: true },
    expected: {
      source: "draft_metadata",
      primarySrc: "https://cdn.example.com/thumb.webp",
      candidates: [
        "https://cdn.example.com/thumb.webp",
        "/placeholder.jpg",
      ],
    },
  },
  {
    id: "draft-missing-thumbnail-uses-portada",
    draft: {
      portada: "https://cdn.example.com/portada.webp",
    },
    options: { includePlaceholder: false },
    expected: {
      source: "draft_metadata",
      primarySrc: "https://cdn.example.com/portada.webp",
      candidates: ["https://cdn.example.com/portada.webp"],
    },
  },
  {
    id: "draft-fallback-only-placeholder",
    draft: {},
    options: { includePlaceholder: true },
    expected: {
      source: "placeholder",
      primarySrc: "/placeholder.jpg",
      candidates: ["/placeholder.jpg"],
    },
  },
  {
    id: "draft-preview-url-only-remains-compatible",
    draft: {
      previewUrl: "/previews/draft-only.jpg",
    },
    options: { includePlaceholder: false },
    expected: {
      source: "draft_metadata",
      primarySrc: "/previews/draft-only.jpg",
      candidates: ["/previews/draft-only.jpg"],
    },
  },
];

export const publicationPreviewFixtures = [
  {
    id: "publication-linked-publication-metadata-wins",
    publication: {
      portada: "https://cdn.example.com/publicada.webp",
      borradorSlug: "draft-linked",
    },
    fallbackSlug: "publicada-uno",
    linkedDraft: {
      thumbnailUrl: "https://cdn.example.com/draft-thumb.webp",
    },
    expected: {
      source: "publication_metadata",
      primarySrc: "https://cdn.example.com/publicada.webp",
      linkedDraftSlug: "draft-linked",
      candidates: [
        "https://cdn.example.com/publicada.webp",
        "https://cdn.example.com/draft-thumb.webp",
      ],
    },
  },
  {
    id: "publication-linked-draft-fallback",
    publication: {
      borradorSlug: "draft-linked",
    },
    fallbackSlug: "publicada-dos",
    linkedDraft: {
      thumbnailUrl: "https://cdn.example.com/draft-thumb.webp",
    },
    expected: {
      source: "linked_draft",
      primarySrc: "https://cdn.example.com/draft-thumb.webp",
      linkedDraftSlug: "draft-linked",
      candidates: ["https://cdn.example.com/draft-thumb.webp"],
    },
  },
  {
    id: "publication-missing-thumbnail-uses-preview-url",
    publication: {
      previewUrl: "https://cdn.example.com/public-preview.jpg",
      borradorSlug: "draft-linked",
    },
    fallbackSlug: "publicada-tres",
    linkedDraft: {
      thumbnailUrl: "https://cdn.example.com/draft-thumb.webp",
    },
    expected: {
      source: "publication_metadata",
      primarySrc: "https://cdn.example.com/public-preview.jpg",
      linkedDraftSlug: "draft-linked",
      candidates: [
        "https://cdn.example.com/public-preview.jpg",
        "https://cdn.example.com/draft-thumb.webp",
      ],
    },
  },
  {
    id: "publication-fallback-only-none",
    publication: {
      borradorSlug: "draft-without-preview",
    },
    fallbackSlug: "publicada-cuatro",
    linkedDraft: {},
    expected: {
      source: "none",
      primarySrc: "",
      linkedDraftSlug: "draft-without-preview",
      candidates: [],
    },
  },
];
