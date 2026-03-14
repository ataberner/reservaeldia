function normalizeText(value) {
  return String(value || "").trim();
}

export function normalizeDashboardTagSlug(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function toStringList(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeText(entry)).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => normalizeText(entry))
      .filter(Boolean);
  }
  return [];
}

function normalizeFeaturedRow(value) {
  const source = value && typeof value === "object" ? value : {};
  const tagSlug = normalizeDashboardTagSlug(source.tagSlug || source.tag);

  return {
    active: source.active === true && Boolean(tagSlug),
    tagSlug,
    tagLabel: normalizeText(source.tagLabel),
  };
}

function normalizeCategoryRows(value) {
  const source = Array.isArray(value) ? value : [];
  const seenTagSlugs = new Set();

  return source
    .map((entry, index) => {
      const item = entry && typeof entry === "object" ? entry : {};
      const tagSlug = normalizeDashboardTagSlug(item.tagSlug || item.tag);
      return {
        id: normalizeDashboardTagSlug(item.id || tagSlug || `categoria-${index + 1}`),
        tagSlug,
        tagLabel: normalizeText(item.tagLabel),
        active: item.active === true && Boolean(tagSlug),
        order: Number.isFinite(Number(item.order))
          ? Math.max(1, Math.round(Number(item.order)))
          : (index + 1) * 10,
      };
    })
    .filter((row) => {
      if (!row.tagSlug) return false;
      if (seenTagSlugs.has(row.tagSlug)) return false;
      seenTagSlugs.add(row.tagSlug);
      return true;
    })
    .sort((left, right) => {
      const orderDelta = left.order - right.order;
      if (orderDelta !== 0) return orderDelta;
      return left.tagSlug.localeCompare(right.tagSlug);
    });
}

export function normalizeDashboardHomeConfig(value) {
  const source = value && typeof value === "object" ? value : {};

  return {
    version: Number.isFinite(Number(source.version))
      ? Math.max(1, Math.round(Number(source.version)))
      : 1,
    featuredRow: normalizeFeaturedRow(source.featuredRow),
    categoryRows: normalizeCategoryRows(source.categoryRows),
    updatedAt: source.updatedAt || null,
    updatedByUid: normalizeText(source.updatedByUid),
  };
}

export function collectTemplateTagSlugs(template) {
  const sourceTags = toStringList(template?.tags);
  return Array.from(
    new Set(sourceTags.map((entry) => normalizeDashboardTagSlug(entry)).filter(Boolean))
  );
}

export function buildPublishedTagStats(templates = []) {
  const counts = new Map();

  (Array.isArray(templates) ? templates : []).forEach((template) => {
    collectTemplateTagSlugs(template).forEach((tagSlug) => {
      counts.set(tagSlug, Number(counts.get(tagSlug) || 0) + 1);
    });
  });

  return counts;
}

export function groupTemplatesByTagSlug(templates = []) {
  const grouped = new Map();

  (Array.isArray(templates) ? templates : []).forEach((template) => {
    collectTemplateTagSlugs(template).forEach((tagSlug) => {
      const current = grouped.get(tagSlug) || [];
      current.push(template);
      grouped.set(tagSlug, current);
    });
  });

  return grouped;
}

export function resolveHeroScrollTarget(sections = []) {
  const safeSections = Array.isArray(sections) ? sections : [];
  const featuredSection = safeSections.find((section) => section?.kind === "featured_templates");
  if (featuredSection?.anchorId) return featuredSection.anchorId;

  const firstCategory = safeSections.find((section) => section?.kind === "template_category");
  if (firstCategory?.anchorId) return firstCategory.anchorId;

  return "dashboard-home-template-collections";
}

export function buildDashboardHomeSections({
  drafts = [],
  publications = [],
  templates = [],
  config = null,
} = {}) {
  const safeDrafts = Array.isArray(drafts) ? drafts : [];
  const safePublications = Array.isArray(publications) ? publications : [];
  const safeTemplates = Array.isArray(templates) ? templates : [];
  const normalizedConfig = normalizeDashboardHomeConfig(config);
  const templatesByTagSlug = groupTemplatesByTagSlug(safeTemplates);
  const sections = [];

  if (safePublications.length > 0) {
    sections.push({
      id: "dashboard-publications",
      kind: "publications",
      title: "Publicadas",
      description: "Gestiona tus invitaciones activas, pausadas y finalizadas desde un solo lugar.",
      items: safePublications,
    });
  }

  if (safeDrafts.length > 0) {
    sections.push({
      id: "dashboard-drafts",
      kind: "drafts",
      title: "Borradores",
      description: "Retoma invitaciones en proceso y sigue justo donde las dejaste.",
      items: safeDrafts,
    });
  }

  const featuredRow = normalizedConfig.featuredRow;
  if (featuredRow.active && featuredRow.tagSlug) {
    const featuredItems = templatesByTagSlug.get(featuredRow.tagSlug) || [];
    if (featuredItems.length > 0) {
      sections.push({
        id: "dashboard-featured-templates",
        anchorId: "dashboard-home-section-featured",
        kind: "featured_templates",
        title: "Plantillas destacadas",
        description:
          featuredRow.tagLabel
            ? `Una seleccion editorial dentro de ${featuredRow.tagLabel}.`
            : "Una seleccion editorial para empezar rapido.",
        tagSlug: featuredRow.tagSlug,
        tagLabel: featuredRow.tagLabel || "",
        items: featuredItems,
      });
    }
  }

  normalizedConfig.categoryRows.forEach((row) => {
    if (!row.active || !row.tagSlug) return;
    const categoryItems = templatesByTagSlug.get(row.tagSlug) || [];
    if (!categoryItems.length) return;

    sections.push({
      id: `dashboard-category-${row.id}`,
      anchorId: `dashboard-home-category-${row.id}`,
      kind: "template_category",
      title: row.tagLabel || row.tagSlug,
      description:
        row.tagLabel
          ? `Explora la coleccion ${row.tagLabel}.`
          : "Explora esta coleccion editorial.",
      tagSlug: row.tagSlug,
      tagLabel: row.tagLabel || "",
      items: categoryItems,
    });
  });

  return {
    sections,
    heroTargetId: resolveHeroScrollTarget(sections),
    hasTemplateSections: sections.some(
      (section) =>
        section?.kind === "featured_templates" || section?.kind === "template_category"
    ),
  };
}
