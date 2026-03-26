import { useCallback, useEffect, useMemo, useState } from "react";
import {
  doc,
  getDoc,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions as cloudFunctions } from "@/firebase";
import {
  delay,
  getErrorMessage,
  getFirstQueryValue,
} from "@/domain/dashboard/helpers";
import {
  buildDashboardAsPathFromQuery,
  buildLegacyDraftNotice,
  createAdminDraftViewState,
  createDashboardEditorSession,
  createTemplateWorkspaceViewState,
  normalizeDashboardAsPath,
  normalizeTemplateWorkspaceFromDraft,
  recoverQueryFromCorruptedSlug,
  resolveCompatibleDraftForDashboardEditor,
  sanitizeDraftSlug,
  sanitizeUidValue,
  isTruthyQueryFlag,
} from "@/domain/dashboard/editorSession";
import { isDraftTrashed } from "@/domain/drafts/state";
import { getTemplateEditorDocument } from "@/domain/templates/adminService";
import {
  getTemplateDraftDebugSession,
  groupTemplateDraftDebug,
} from "@/domain/templates/draftPersonalizationDebug";
import { pushEditorBreadcrumb } from "@/lib/monitoring/editorIssueReporter";

export function useDashboardEditorRoute({
  router,
  checkingAuth,
  loadingAdminAccess,
  usuarioUid,
  isSuperAdmin,
  canManageSite,
} = {}) {
  const [slugInvitacionState, setSlugInvitacionState] = useState(null);
  const [modoEditor, setModoEditor] = useState(null);
  const [vista, setVista] = useState("home");
  const [legacyDraftNotice, setLegacyDraftNotice] = useState(null);
  const [adminDraftView, setAdminDraftView] = useState(() =>
    createAdminDraftViewState()
  );
  const [templateWorkspaceView, setTemplateWorkspaceView] = useState(() =>
    createTemplateWorkspaceViewState()
  );
  const [editorSession, setEditorSession] = useState(() =>
    createDashboardEditorSession()
  );

  const adminDraftSnapshotCallable = useMemo(
    () => httpsCallable(cloudFunctions, "getAdminDraftSnapshot"),
    []
  );

  const resetAdminDraftView = useCallback(() => {
    setAdminDraftView(createAdminDraftViewState());
  }, []);

  const resetTemplateWorkspaceView = useCallback(() => {
    setTemplateWorkspaceView(createTemplateWorkspaceViewState());
  }, []);

  const resetEditorSession = useCallback(() => {
    setEditorSession(createDashboardEditorSession());
  }, []);

  const setSlugInvitacion = useCallback(
    (nextValue) => {
      setSlugInvitacionState((prev) => {
        const resolved =
          typeof nextValue === "function" ? nextValue(prev) : nextValue;
        if (!resolved) {
          resetAdminDraftView();
          resetTemplateWorkspaceView();
          resetEditorSession();
        }
        return resolved;
      });
    },
    [resetAdminDraftView, resetEditorSession, resetTemplateWorkspaceView]
  );

  const replaceDashboardQuerySafely = useCallback(
    (nextQuery = {}, options = { shallow: true }) => {
      const targetAsPath = buildDashboardAsPathFromQuery(nextQuery);
      const currentAsPath =
        typeof window !== "undefined"
          ? `${window.location.pathname || ""}${window.location.search || ""}`
          : typeof router.asPath === "string"
            ? router.asPath
            : "";

      if (
        normalizeDashboardAsPath(currentAsPath) ===
        normalizeDashboardAsPath(targetAsPath)
      ) {
        return Promise.resolve(false);
      }

      return router
        .replace({ pathname: "/dashboard", query: nextQuery }, undefined, options)
        .then(() => true)
        .catch((error) => {
          const message = String(error?.message || "");
          if (message.includes("attempted to hard navigate to the same URL")) {
            return false;
          }
          throw error;
        });
    },
    [router]
  );

  const handleOpenTemplateSession = useCallback(
    (payload = {}) => {
      const safePayload = payload && typeof payload === "object" ? payload : {};
      const nextTemplateId = sanitizeDraftSlug(
        typeof safePayload.templateId === "string" ? safePayload.templateId : ""
      );
      if (!nextTemplateId) return;

      const initialData =
        safePayload.editorDocument && typeof safePayload.editorDocument === "object"
          ? safePayload.editorDocument
          : null;
      const nextView = initialData
        ? normalizeTemplateWorkspaceFromDraft(initialData)
        : {
            enabled: true,
            readOnly: false,
            draftName: "",
            templateName:
              typeof safePayload?.item?.nombre === "string"
                ? safePayload.item.nombre.trim()
                : "",
            estadoEditorial:
              typeof safePayload?.item?.estadoEditorial === "string"
                ? safePayload.item.estadoEditorial.trim()
                : "en_proceso",
            permissions:
              safePayload?.item?.permissions &&
              typeof safePayload.item.permissions === "object"
                ? safePayload.item.permissions
                : {},
          };

      resetAdminDraftView();
      setLegacyDraftNotice(null);
      setTemplateWorkspaceView({
        ...nextView,
        enabled: true,
        status: initialData ? "ready" : "loading",
        templateId: nextTemplateId,
        initialData,
      });
      setEditorSession(
        createDashboardEditorSession({
          kind: "template",
          id: nextTemplateId,
        })
      );
      setSlugInvitacionState((prev) =>
        prev === nextTemplateId ? prev : nextTemplateId
      );
      setModoEditor((prev) => (prev === "konva" ? prev : "konva"));
      setVista((prev) => (prev === "editor" ? prev : "editor"));
    },
    [resetAdminDraftView]
  );

  const resolveCompatibleDraft = useCallback(
    ({ slug, uid }) =>
      resolveCompatibleDraftForDashboardEditor({
        slug,
        uid,
        readDraftBySlug: async (draftSlug) =>
          getDoc(doc(db, "borradores", draftSlug)),
        readPublicationBySlug: async (publicSlug) =>
          getDoc(doc(db, "publicadas", publicSlug)),
        isDraftTrashed,
      }),
    []
  );

  const abrirBorradorEnEditor = useCallback(
    async (slug) => {
      const safeSlug = sanitizeDraftSlug(slug);
      if (!safeSlug) return;

      let compatibleDraft = usuarioUid
        ? await resolveCompatibleDraft({
            slug: safeSlug,
            uid: usuarioUid,
          })
        : {
            status: "ok",
            slug: safeSlug,
            draftData: null,
          };

      if (
        usuarioUid &&
        compatibleDraft.status !== "ok" &&
        compatibleDraft.status !== "legacy"
      ) {
        for (const retryDelayMs of [180, 320, 520, 800]) {
          await delay(retryDelayMs);
          compatibleDraft = await resolveCompatibleDraft({
            slug: safeSlug,
            uid: usuarioUid,
          });
          if (
            compatibleDraft.status === "ok" ||
            compatibleDraft.status === "legacy"
          ) {
            break;
          }
        }
      }

      if (compatibleDraft.status !== "ok" || !compatibleDraft.slug) {
        if (compatibleDraft.status === "legacy") {
          setLegacyDraftNotice(
            buildLegacyDraftNotice(safeSlug, compatibleDraft.draftData)
          );
          pushEditorBreadcrumb("dashboard-open-legacy-blocked", {
            slug: safeSlug,
          });
        }

        resetTemplateWorkspaceView();
        resetEditorSession();
        setSlugInvitacionState(null);
        setModoEditor(null);
        setVista("home");
        return;
      }

      const templateDraftDebugSession = getTemplateDraftDebugSession();
      if (
        templateDraftDebugSession?.slug &&
        templateDraftDebugSession.slug === compatibleDraft.slug
      ) {
        const draftObjects = Array.isArray(compatibleDraft.draftData?.objetos)
          ? compatibleDraft.draftData.objetos
          : [];
        const debugObjectsById = Object.fromEntries(
          draftObjects
            .filter((objeto) =>
              Object.prototype.hasOwnProperty.call(
                templateDraftDebugSession.objectsById || {},
                String(objeto?.id || "")
              )
            )
            .map((objeto) => [
              String(objeto?.id || ""),
              {
                text: String(objeto?.texto || ""),
                x: Number.isFinite(Number(objeto?.x)) ? Number(objeto.x) : null,
                y: Number.isFinite(Number(objeto?.y)) ? Number(objeto.y) : null,
                align: objeto?.align || null,
                width: Number.isFinite(Number(objeto?.width))
                  ? Number(objeto.width)
                  : null,
                rotation: Number.isFinite(Number(objeto?.rotation))
                  ? Number(objeto.rotation)
                  : 0,
                scaleX: Number.isFinite(Number(objeto?.scaleX))
                  ? Number(objeto.scaleX)
                  : 1,
                scaleY: Number.isFinite(Number(objeto?.scaleY))
                  ? Number(objeto.scaleY)
                  : 1,
              },
            ])
            .filter(([id]) => id)
        );

        groupTemplateDraftDebug("dashboard:open-editor:draft-read", [
          ["dashboard:open-editor:session", templateDraftDebugSession],
          ["dashboard:open-editor:draft-objects", debugObjectsById],
        ]);
      }

      setLegacyDraftNotice(null);
      resetTemplateWorkspaceView();
      setEditorSession(
        createDashboardEditorSession({
          kind: "draft",
          id: compatibleDraft.slug,
        })
      );
      setSlugInvitacionState(compatibleDraft.slug);
      setModoEditor("konva");
      setVista("editor");

      const nextQuery = { slug: compatibleDraft.slug };
      const currentQuery =
        router?.query && typeof router.query === "object" ? router.query : {};
      let locationParams = null;
      if (typeof window !== "undefined") {
        try {
          locationParams = new URLSearchParams(window.location.search || "");
        } catch {
          locationParams = null;
        }
      }
      const passthroughKeys = ["phase_atomic_v2", "inlineOverlayEngine"];
      passthroughKeys.forEach((key) => {
        const value = currentQuery[key];
        if (typeof value === "string" && value.trim()) {
          nextQuery[key] = value;
          return;
        }
        if (Array.isArray(value)) {
          const first = value.find(
            (item) => typeof item === "string" && item.trim()
          );
          if (typeof first === "string" && first.trim()) {
            nextQuery[key] = first;
          }
        }
        if (typeof nextQuery[key] === "undefined" && locationParams) {
          const fromLocation = locationParams.get(key);
          if (typeof fromLocation === "string" && fromLocation.trim()) {
            nextQuery[key] = fromLocation;
          } else if (locationParams.has(key) && key === "phase_atomic_v2") {
            nextQuery[key] = "1";
          }
        }
      });

      if (
        nextQuery.inlineOverlayEngine === "phase_atomic_v2" ||
        nextQuery.phase_atomic_v2 === "1"
      ) {
        try {
          window.__INLINE_OVERLAY_ENGINE = "phase_atomic_v2";
          window.__INLINE_AB = {
            ...(window.__INLINE_AB && typeof window.__INLINE_AB === "object"
              ? window.__INLINE_AB
              : {}),
            overlayEngine: "phase_atomic_v2",
          };
        } catch {}
      }

      void replaceDashboardQuerySafely(nextQuery, { shallow: true });
    },
    [
      replaceDashboardQuerySafely,
      resetEditorSession,
      resetTemplateWorkspaceView,
      resolveCompatibleDraft,
      router,
      usuarioUid,
    ]
  );

  useEffect(() => {
    if (!router.isReady) return;
    if (checkingAuth) return;
    if (loadingAdminAccess) return;

    let cancelled = false;

    const rawSlugParam = getFirstQueryValue(router.query?.slug);
    const slugURL = sanitizeDraftSlug(rawSlugParam);
    const rawTemplateIdParam = getFirstQueryValue(router.query?.templateId);
    const templateIdURL = sanitizeDraftSlug(rawTemplateIdParam);
    const adminViewEnabled = isTruthyQueryFlag(router.query?.adminView);
    const ownerUidFromQuery = sanitizeUidValue(
      getFirstQueryValue(router.query?.ownerUid)
    );
    const recoveredQuery = recoverQueryFromCorruptedSlug(rawSlugParam);
    const recoveredQueryKeys = Object.keys(recoveredQuery).filter(
      (key) => typeof router.query?.[key] === "undefined"
    );
    const shouldNormalizeUrl =
      Boolean(rawSlugParam) &&
      Boolean(slugURL) &&
      (rawSlugParam !== slugURL || recoveredQueryKeys.length > 0);
    const shouldNormalizeTemplateUrl =
      Boolean(rawTemplateIdParam) &&
      Boolean(templateIdURL) &&
      rawTemplateIdParam !== templateIdURL;

    const syncEditorSlugFromQuery = async () => {
      const baseNextQuery = { ...router.query };
      recoveredQueryKeys.forEach((key) => {
        baseNextQuery[key] = recoveredQuery[key];
      });

      if (adminViewEnabled) {
        resetTemplateWorkspaceView();
        if (!slugURL || !ownerUidFromQuery) {
          const nextQuery = { ...baseNextQuery };
          delete nextQuery.slug;
          delete nextQuery.adminView;
          delete nextQuery.ownerUid;
          void replaceDashboardQuerySafely(nextQuery, { shallow: true });
          resetAdminDraftView();
          resetTemplateWorkspaceView();
          resetEditorSession();
          setSlugInvitacionState(null);
          setModoEditor(null);
          setVista("home");
          return;
        }

        if (!isSuperAdmin) {
          const nextQuery = { ...baseNextQuery };
          delete nextQuery.slug;
          delete nextQuery.adminView;
          delete nextQuery.ownerUid;
          void replaceDashboardQuerySafely(nextQuery, { shallow: true });
          pushEditorBreadcrumb("dashboard-adminview-access-denied", {
            slug: slugURL,
            ownerUid: ownerUidFromQuery,
          });
          resetAdminDraftView();
          resetTemplateWorkspaceView();
          resetEditorSession();
          setSlugInvitacionState(null);
          setModoEditor(null);
          setVista("home");
          return;
        }

        setAdminDraftView(
          createAdminDraftViewState({
            enabled: true,
            status: "loading",
            ownerUid: ownerUidFromQuery,
            slug: slugURL,
          })
        );

        try {
          const result = await adminDraftSnapshotCallable({
            ownerUid: ownerUidFromQuery,
            slug: slugURL,
          });
          const data = result?.data || {};
          if (cancelled) return;

          const normalizedSlug =
            sanitizeDraftSlug(
              typeof data.slug === "string" ? data.slug : slugURL
            ) || slugURL;
          const normalizedOwnerUid =
            sanitizeUidValue(
              typeof data.ownerUid === "string" ? data.ownerUid : ownerUidFromQuery
            ) || ownerUidFromQuery;
          const draftName =
            typeof data.draftName === "string" ? data.draftName : "";
          const status =
            typeof data.status === "string" ? data.status : "unavailable";
          const draftData =
            data.draft && typeof data.draft === "object" ? data.draft : null;

          if (status !== "ok" || !draftData) {
            const nextQuery = { ...baseNextQuery };
            delete nextQuery.slug;
            delete nextQuery.adminView;
            delete nextQuery.ownerUid;
            void replaceDashboardQuerySafely(nextQuery, { shallow: true });

            pushEditorBreadcrumb(
              status === "legacy"
                ? "dashboard-adminview-legacy-blocked"
                : "dashboard-adminview-unavailable",
              {
                slug: normalizedSlug,
                ownerUid: normalizedOwnerUid,
              }
            );

            if (status === "legacy") {
              setLegacyDraftNotice(
                buildLegacyDraftNotice(normalizedSlug, {
                  nombre: draftName || normalizedSlug,
                })
              );
            }

            resetAdminDraftView();
            resetTemplateWorkspaceView();
            resetEditorSession();
            setSlugInvitacionState(null);
            setModoEditor(null);
            setVista("home");
            return;
          }

          if (
            shouldNormalizeUrl ||
            normalizedSlug !== slugURL ||
            normalizedOwnerUid !== ownerUidFromQuery ||
            getFirstQueryValue(router.query?.adminView) !== "1"
          ) {
            const nextQuery = {
              ...baseNextQuery,
              slug: normalizedSlug,
              adminView: "1",
              ownerUid: normalizedOwnerUid,
            };
            void replaceDashboardQuerySafely(nextQuery, { shallow: true });
            pushEditorBreadcrumb("dashboard-adminview-query-normalized", {
              slugRaw: rawSlugParam,
              slug: normalizedSlug,
              ownerUid: normalizedOwnerUid,
            });
          }

          setLegacyDraftNotice(null);
          resetTemplateWorkspaceView();
          setEditorSession(
            createDashboardEditorSession({
              kind: "draft",
              id: normalizedSlug,
            })
          );
          setAdminDraftView(
            createAdminDraftViewState({
              enabled: true,
              status: "ready",
              ownerUid: normalizedOwnerUid,
              slug: normalizedSlug,
              draftData,
              draftName,
            })
          );
          setSlugInvitacionState((prev) =>
            prev === normalizedSlug ? prev : normalizedSlug
          );
          setModoEditor((prev) => (prev === "konva" ? prev : "konva"));
          setVista((prev) => (prev === "editor" ? prev : "editor"));
          return;
        } catch (error) {
          if (cancelled) return;

          console.error("Error cargando snapshot admin del borrador:", error);
          pushEditorBreadcrumb("dashboard-adminview-load-error", {
            slug: slugURL,
            ownerUid: ownerUidFromQuery,
            message: getErrorMessage(error, "adminview-load-error"),
          });

          const nextQuery = { ...baseNextQuery };
          delete nextQuery.slug;
          delete nextQuery.adminView;
          delete nextQuery.ownerUid;
          void replaceDashboardQuerySafely(nextQuery, { shallow: true });

          resetAdminDraftView();
          resetTemplateWorkspaceView();
          resetEditorSession();
          setSlugInvitacionState(null);
          setModoEditor(null);
          setVista("home");
          return;
        }
      }

      if (templateIdURL) {
        resetAdminDraftView();

        if (loadingAdminAccess) {
          return;
        }

        if (!canManageSite) {
          const nextQuery = { ...baseNextQuery };
          delete nextQuery.templateId;
          void replaceDashboardQuerySafely(nextQuery, { shallow: true });
          resetTemplateWorkspaceView();
          resetEditorSession();
          setSlugInvitacionState(null);
          setModoEditor(null);
          setVista("home");
          return;
        }

        setTemplateWorkspaceView(
          createTemplateWorkspaceViewState({
            enabled: true,
            status: "loading",
            templateId: templateIdURL,
          })
        );

        try {
          const result = await getTemplateEditorDocument({
            templateId: templateIdURL,
          });
          if (cancelled) return;

          const editorDocument =
            result?.editorDocument && typeof result.editorDocument === "object"
              ? result.editorDocument
              : null;
          if (!editorDocument) {
            throw new Error("No se pudo cargar la plantilla interna.");
          }

          const normalizedTemplateId =
            sanitizeDraftSlug(
              typeof result?.item?.id === "string"
                ? result.item.id
                : typeof editorDocument?.plantillaId === "string"
                  ? editorDocument.plantillaId
                  : templateIdURL
            ) || templateIdURL;

          if (
            shouldNormalizeTemplateUrl ||
            normalizedTemplateId !== templateIdURL
          ) {
            const nextQuery = {
              ...baseNextQuery,
              templateId: normalizedTemplateId,
            };
            delete nextQuery.slug;
            void replaceDashboardQuerySafely(nextQuery, { shallow: true });
          }

          const nextView = normalizeTemplateWorkspaceFromDraft(editorDocument);
          setLegacyDraftNotice(null);
          setTemplateWorkspaceView({
            ...nextView,
            enabled: true,
            status: "ready",
            templateId: normalizedTemplateId,
            initialData: editorDocument,
          });
          setEditorSession(
            createDashboardEditorSession({
              kind: "template",
              id: normalizedTemplateId,
            })
          );
          setSlugInvitacionState((prev) =>
            prev === normalizedTemplateId ? prev : normalizedTemplateId
          );
          setModoEditor((prev) => (prev === "konva" ? prev : "konva"));
          setVista((prev) => (prev === "editor" ? prev : "editor"));
          return;
        } catch (error) {
          if (cancelled) return;
          console.error("Error cargando plantilla interna:", error);
          const nextQuery = { ...baseNextQuery };
          delete nextQuery.templateId;
          void replaceDashboardQuerySafely(nextQuery, { shallow: true });
          resetTemplateWorkspaceView();
          resetEditorSession();
          setSlugInvitacionState(null);
          setModoEditor(null);
          setVista("home");
          return;
        }
      }

      resetAdminDraftView();
      resetTemplateWorkspaceView();
      resetEditorSession();

      let normalizedSlug = slugURL;
      let compatibilityStatus = slugURL ? "ok" : "idle";
      let compatibleDraftData = null;

      if (slugURL && usuarioUid) {
        const compatibleDraft = await resolveCompatibleDraft({
          slug: slugURL,
          uid: usuarioUid,
        });
        normalizedSlug = compatibleDraft.slug;
        compatibilityStatus = compatibleDraft.status;
        compatibleDraftData = compatibleDraft.draftData;
      }

      if (cancelled) return;

      if (slugURL && compatibilityStatus !== "ok") {
        const nextQuery = { ...baseNextQuery };
        delete nextQuery.slug;

        void replaceDashboardQuerySafely(nextQuery, { shallow: true });

        pushEditorBreadcrumb(
          compatibilityStatus === "legacy"
            ? "dashboard-slug-legacy-deprecated"
            : "dashboard-slug-access-denied",
          {
            slugRaw: rawSlugParam,
            slug: slugURL,
          }
        );

        if (compatibilityStatus === "legacy") {
          setLegacyDraftNotice(buildLegacyDraftNotice(slugURL, compatibleDraftData));
        }

        setSlugInvitacionState(null);
        setModoEditor(null);
        setVista("home");
        return;
      }

      if (shouldNormalizeUrl || (normalizedSlug && normalizedSlug !== slugURL)) {
        const nextQuery = { ...baseNextQuery, slug: normalizedSlug };
        void replaceDashboardQuerySafely(nextQuery, { shallow: true });
        pushEditorBreadcrumb("dashboard-slug-sanitized", {
          slugRaw: rawSlugParam,
          slug: normalizedSlug,
          recoveredKeys: recoveredQueryKeys,
        });
      }

      if (normalizedSlug) {
        setLegacyDraftNotice(null);
        setTemplateWorkspaceView({
          ...normalizeTemplateWorkspaceFromDraft(compatibleDraftData),
          status: "ready",
          initialData: null,
        });
        setEditorSession(
          createDashboardEditorSession({
            kind: "draft",
            id: normalizedSlug,
          })
        );
        setSlugInvitacionState((prev) =>
          prev === normalizedSlug ? prev : normalizedSlug
        );
        setModoEditor((prev) => (prev === "konva" ? prev : "konva"));
        setVista((prev) => (prev === "editor" ? prev : "editor"));
        return;
      }

      resetTemplateWorkspaceView();
      resetEditorSession();
      setSlugInvitacionState(null);
      setModoEditor(null);
      setVista((prev) => (prev === "editor" ? "home" : prev));
    };

    void syncEditorSlugFromQuery();

    return () => {
      cancelled = true;
    };
  }, [
    adminDraftSnapshotCallable,
    canManageSite,
    checkingAuth,
    isSuperAdmin,
    loadingAdminAccess,
    replaceDashboardQuerySafely,
    resetAdminDraftView,
    resetEditorSession,
    resetTemplateWorkspaceView,
    resolveCompatibleDraft,
    router,
    usuarioUid,
  ]);

  const requestedRouteSlug = router.isReady
    ? sanitizeDraftSlug(getFirstQueryValue(router.query?.slug))
    : null;
  const requestedRouteTemplateId = router.isReady
    ? sanitizeDraftSlug(getFirstQueryValue(router.query?.templateId))
    : null;
  const requestedAdminView = router.isReady
    ? isTruthyQueryFlag(router.query?.adminView)
    : false;
  const isResolvingEditorRoute =
    router.isReady &&
    !slugInvitacionState &&
    Boolean(requestedRouteSlug || requestedRouteTemplateId);
  const pendingEditorRouteLabel = requestedRouteTemplateId
    ? "Abriendo plantilla interna..."
    : requestedAdminView
      ? "Cargando vista administrativa del borrador..."
      : "Abriendo editor...";

  const isAdminReadOnlyView =
    adminDraftView.enabled === true && adminDraftView.status === "ready";
  const isTemplateWorkspaceReadOnly =
    templateWorkspaceView.enabled === true &&
    templateWorkspaceView.readOnly === true;
  const isEditorReadOnly = isAdminReadOnlyView || isTemplateWorkspaceReadOnly;
  const isTemplateEditorSession = editorSession.kind === "template";

  return {
    slugInvitacion: slugInvitacionState,
    setSlugInvitacion,
    modoEditor,
    setModoEditor,
    vista,
    setVista,
    legacyDraftNotice,
    setLegacyDraftNotice,
    adminDraftView,
    templateWorkspaceView,
    editorSession,
    isAdminReadOnlyView,
    isTemplateWorkspaceReadOnly,
    isEditorReadOnly,
    isTemplateEditorSession,
    requestedRouteSlug,
    requestedRouteTemplateId,
    requestedAdminView,
    isResolvingEditorRoute,
    pendingEditorRouteLabel,
    handleOpenTemplateSession,
    abrirBorradorEnEditor,
  };
}
