import { useCallback, useEffect, useRef, useState } from "react";
import { providerAdminRequest } from "@/domain/providers/adminApi";
import { emptyProviderDraft, normalizeDraftForForm, providerErrorMessage, setDraftField } from "@/domain/providers/adminForm";

const EMPTY_FILTERS = { search: "", categoryId: "", city: "", publication: "", owner: "", pending: "" };

export default function useProviderAdmin() {
  const [access, setAccess] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [page, setPage] = useState(1);
  const cursors = useRef([null]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const appliedFilters = useRef(EMPTY_FILTERS);
  const [provider, setProvider] = useState(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(emptyProviderDraft);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState(null);
  const [reviewedRevision, setReviewedRevision] = useState(null);
  const mounted = useRef(false);
  const requestId = useRef(0);

  const run = useCallback(async (operation) => {
    const id = ++requestId.current;
    setBusy(true); setError(""); setMessage("");
    try { return await operation(() => mounted.current && requestId.current === id); }
    catch (failure) { if (mounted.current && requestId.current === id) setError(providerErrorMessage(failure)); }
    finally { if (mounted.current && requestId.current === id) setBusy(false); }
  }, []);

  const loadList = useCallback(async ({ cursor = null, nextPage = 1, nextFilters = appliedFilters.current } = {}) => run(async (current) => {
    const { pending, ...otherFilters } = nextFilters;
    const result = await providerAdminRequest("list", { ...otherFilters, ...(pending ? { pending: pending === "true" } : {}), cursor, pageSize: 20 });
    if (!current()) return;
    setItems(result.items); setNextCursor(result.nextCursor); setPage(nextPage);
    appliedFilters.current = nextFilters;
  }), [run]);

  const initialize = useCallback(() => run(async (current) => {
      const result = await providerAdminRequest("access");
      if (!current()) return;
      setAccess(result);
      if (!result.enabled) return;
      const [nextCatalog, list] = await Promise.all([
        providerAdminRequest("catalog"), providerAdminRequest("list", { pageSize: 20 }),
      ]);
      if (!current()) return;
      setCatalog(nextCatalog); setItems(list.items); setNextCursor(list.nextCursor);
    }), [run]);

  useEffect(() => {
    mounted.current = true;
    void initialize();
    return () => { mounted.current = false; requestId.current += 1; };
  }, [initialize]);

  function acceptProvider(result) {
    setProvider(result.provider); setCreating(false);
    setDraft(normalizeDraftForForm(result.provider.draft)); setNotes(result.provider.internalNotes || "");
    setPreview(null); setReviewedRevision(null);
  }
  const dirty = creating || Boolean(provider && (JSON.stringify(draft) !== JSON.stringify(normalizeDraftForForm(provider.draft)) || notes !== (provider.internalNotes || "")));
  useEffect(() => {
    if (!dirty) return undefined;
    const warnUnsaved = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warnUnsaved);
    return () => window.removeEventListener("beforeunload", warnUnsaved);
  }, [dirty]);
  const setField = (path, value) => setDraft((previous) => setDraftField(previous, path, value));
  function create() {
    setProvider(null); setCreating(true); setDraft(emptyProviderDraft()); setNotes("");
    setPreview(null); setReviewedRevision(null); setError(""); setMessage("");
  }
  async function open(id) {
    await run(async (current) => {
      const result = await providerAdminRequest("get", { id });
      if (current()) acceptProvider(result);
    });
  }
  async function save() {
    await run(async (current) => {
      const result = await providerAdminRequest(creating ? "create" : "save", { ...(provider ? { id: provider.id, expectedRevision: provider.revision, ...(provider.versionToken ? { expectedVersionToken: provider.versionToken } : {}) } : {}), draft, internalNotes: notes });
      if (!current()) return;
      acceptProvider(result); setMessage("Borrador guardado. La versión aprobada se conserva.");
    });
  }
  async function transition(operation, reason = "") {
    await run(async (current) => {
      const result = await providerAdminRequest(operation, { id: provider.id, expectedRevision: provider.revision, ...(provider.versionToken ? { expectedVersionToken: provider.versionToken } : {}), ...(operation === "approve" ? { reviewRevision: reviewedRevision } : {}), reason });
      if (!current()) return;
      acceptProvider(result);
      setMessage({ submit: "Revisión enviada. La versión aprobada anterior se conserva.", approve: "Revisión aprobada. El directorio público continúa desactivado.", requestChanges: "Correcciones solicitadas.", pause: "Ficha pausada.", archive: "Ficha archivada. El historial se conserva.", resume: "Ficha reactivada dentro de la beta privada." }[operation]);
    });
  }
  async function showPreview(version) {
    await run(async (current) => {
      const result = await providerAdminRequest("preview", { id: provider.id, version });
      if (!current()) return;
      setPreview({ ...result, version });
      if (version === "review") setReviewedRevision(result.revision);
    });
  }
  async function loadMoreHistory() {
    if (!provider?.historyCursor) return;
    await run(async (current) => {
      const result = await providerAdminRequest("history", { id: provider.id, cursor: provider.historyCursor, pageSize: 50 });
      if (!current()) return;
      setProvider((previous) => ({ ...previous, history: [...previous.history, ...result.items], historyCursor: result.nextCursor }));
    });
  }
  async function back() {
    setProvider(null); setCreating(false); setPreview(null); setError(""); setMessage("");
    await loadList({ cursor: cursors.current[page - 1], nextPage: page });
  }
  function search() { cursors.current = [null]; return loadList({ nextFilters: filters }); }
  function paginate(direction) {
    const nextPage = page + direction;
    if (direction > 0) cursors.current[nextPage - 1] = nextCursor;
    return loadList({ cursor: cursors.current[nextPage - 1], nextPage });
  }
  return { access, catalog, items, nextCursor, page, filters, setFilters, provider, creating, draft, notes, setNotes, busy, error, setError, message, preview, reviewedRevision, dirty, setField, create, open, save, transition, showPreview, loadMoreHistory, back, search, paginate, reload: () => provider ? open(provider.id) : !catalog ? initialize() : loadList() };
}
