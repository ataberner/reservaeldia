// src/components/DashboardHeader.jsx
import { useState, useRef, useEffect } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/firebase";
import { useRouter } from "next/router";
import {
    ChevronDown,
    LogOut,
    Plus,
    Sparkles,
    Trash2,
} from "lucide-react";
import CanvasEditorHeader from "@/components/editor/header/CanvasEditorHeader";
import { markEditorSessionIntentionalExit } from "@/lib/monitoring/editorIssueReporter";
import { buildTemplatePayloadFromAuthoring } from "@/domain/templates/authoring/service";
import {
    convertDraftToTemplate,
    saveTemplateEditorDocument,
} from "@/domain/templates/adminService";
import {
    captureCountdownAuditTemplateDocument,
    recordCountdownAuditSnapshot,
} from "@/domain/countdownAudit/runtime";
import {
    readCanvasEditorMethod,
    readCanvasEditorStage,
} from "@/lib/editorRuntimeBridge";
import { readEditorRenderSnapshot } from "@/lib/editorSnapshotAdapter";

const MOBILE_EDITOR_BREAKPOINT_PX = 768;

function normalizeText(value) {
    return String(value || "").trim();
}

function normalizeEditorSession(value, fallbackId = "") {
    const safeValue = value && typeof value === "object" ? value : {};
    const kind =
        normalizeText(safeValue.kind).toLowerCase() === "template"
            ? "template"
            : "draft";
    const id = normalizeText(safeValue.id) || normalizeText(fallbackId);
    return {
        kind,
        id,
    };
}

function normalizeTemplateWorkspaceMeta(value) {
    const safeValue = value && typeof value === "object" ? value : {};
    const permissions =
        safeValue.permissions && typeof safeValue.permissions === "object"
            ? safeValue.permissions
            : {};

    return {
        enabled: Boolean(
            normalizeText(safeValue.templateId) &&
                normalizeText(safeValue.mode) === "template_edit"
        ),
        templateId: normalizeText(safeValue.templateId),
        templateName: normalizeText(safeValue.templateName) || "",
        estadoEditorial: normalizeText(safeValue.estadoEditorial) || "publicada",
        readOnly: safeValue.readOnly === true || permissions?.readOnly === true,
        permissions,
    };
}

function recordTemplateDashboardCardSnapshot(renderSnapshot, sourceLabel = "") {
    const objetos = Array.isArray(renderSnapshot?.objetos)
        ? renderSnapshot.objetos
        : [];
    const secciones = Array.isArray(renderSnapshot?.secciones)
        ? renderSnapshot.secciones
        : [];
    const countdown = objetos.find((item) => item?.tipo === "countdown") || null;
    if (!countdown) return;

    const altoModo = String(
        secciones.find((section) => section?.id === countdown?.seccionId)?.altoModo || ""
    )
        .trim()
        .toLowerCase();

    recordCountdownAuditSnapshot({
        countdown,
        stage: "template-dashboard-card",
        renderer: "raster-thumbnail",
        sourceDocument: "template-portada",
        viewport: "dashboard",
        wrapperScale: 1,
        usesRasterThumbnail: true,
        altoModo,
        sourceLabel,
    });
}

function AccountSummary({
    usuario,
    inicialUsuario,
    nombreCompletoUsuario,
    emailUsuario,
    avatarSizeClass = "h-8 w-8",
    textClass = "text-[12px]",
}) {
    return (
        <div className="mt-1 flex items-center gap-2">
            {usuario?.photoURL ? (
                <img
                    src={usuario.photoURL}
                    alt="Foto de perfil"
                    className={`${avatarSizeClass} rounded-full object-cover`}
                />
            ) : (
                <div
                    className={`${avatarSizeClass} flex items-center justify-center rounded-full text-xs font-semibold text-white`}
                    style={{ backgroundColor: "#773dbe" }}
                >
                    {inicialUsuario}
                </div>
            )}
            <div className="min-w-0">
                <p
                    className={`truncate font-semibold text-gray-800 ${textClass}`}
                    title={nombreCompletoUsuario}
                >
                    {nombreCompletoUsuario}
                </p>
                <p
                    className={`truncate text-gray-500 ${
                        textClass === "text-sm" ? "text-xs" : "text-[11px]"
                    }`}
                    title={emailUsuario}
                >
                    {emailUsuario}
                </p>
            </div>
        </div>
    );
}

export default function DashboardHeader(props) {
    const {
        slugInvitacion,
        zoom,
        historialExternos,
        futurosExternos,
        usuario,
        setSlugInvitacion,
        setModoEditor,
        toggleZoom,
        generarVistaPrevia,
        vistaActual,
        onCambiarVista,
        canManageSite = false,
        isSuperAdmin = false,
        loadingAdminAccess = false,
        editorReadOnly = false,
        draftDisplayName = "",
        editorSession = null,
        templateSessionMeta = null,
        ensureEditorFlushBeforeAction = null,
        onOpenTemplateSession = null,
    } = props;

    const [menuAbierto, setMenuAbierto] = useState(false);
    const menuRef = useRef(null);
    const headerRef = useRef(null);
    const [nombreBorrador, setNombreBorrador] = useState("");
    const [templateWorkspaceMeta, setTemplateWorkspaceMeta] = useState(() =>
        normalizeTemplateWorkspaceMeta(null)
    );
    const router = useRouter();
    const emailNormalizado = String(usuario?.email || "").trim();
    const nombreNormalizado = String(usuario?.displayName || "").trim();
    const nombreDesdeEmail = emailNormalizado
        .split("@")[0]
        .replace(/[._-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const nombreCompletoUsuario = nombreNormalizado || nombreDesdeEmail || "Usuario";
    const emailUsuario = emailNormalizado || "Sin email";
    const inicialUsuario =
        String(nombreCompletoUsuario || emailNormalizado || "U")
            .trim()
            .charAt(0)
            .toUpperCase() || "U";
    const [isMobile, setIsMobile] = useState(false);
    const normalizedEditorSession = normalizeEditorSession(
        editorSession,
        slugInvitacion
    );
    const isTemplateSession = normalizedEditorSession.kind === "template";

    useEffect(() => {
        if (typeof window === "undefined") return;

        const mq = window.matchMedia(
            `(max-width: ${MOBILE_EDITOR_BREAKPOINT_PX - 1}px)`
        );
        const update = () => setIsMobile(mq.matches);

        update();
        mq.addEventListener?.("change", update);
        window.addEventListener("resize", update);

        return () => {
            mq.removeEventListener?.("change", update);
            window.removeEventListener("resize", update);
        };
    }, []);

    useEffect(() => {
        if (!isMobile) return;
        if (zoom === 1) {
            toggleZoom?.();
        }
    }, [isMobile, zoom, toggleZoom]);

    useEffect(() => {
        if (typeof window === "undefined" || typeof document === "undefined") return;
        const node = headerRef.current;
        if (!node) return;

        const updateHeaderHeightVar = () => {
            const nextHeight = Math.round(node.getBoundingClientRect().height || 52);
            // Runtime-sensitive shell contract: layout, sidebar, and editor
            // overlays consume this CSS variable for fixed-header offsets.
            document.documentElement.style.setProperty(
                "--dashboard-header-height",
                `${nextHeight}px`
            );
        };

        updateHeaderHeightVar();

        if (typeof ResizeObserver !== "undefined") {
            const observer = new ResizeObserver(() => updateHeaderHeightVar());
            observer.observe(node);
            return () => observer.disconnect();
        }

        window.addEventListener("resize", updateHeaderHeightVar);
        return () => window.removeEventListener("resize", updateHeaderHeightVar);
    }, []);

    useEffect(() => {
        const cargarNombre = async () => {
            if (!slugInvitacion) {
                setNombreBorrador("");
                setTemplateWorkspaceMeta(normalizeTemplateWorkspaceMeta(null));
                return;
            }

            if (isTemplateSession) {
                setNombreBorrador(
                    normalizeText(templateSessionMeta?.templateName) ||
                        normalizeText(draftDisplayName) ||
                        "Plantilla"
                );
                setTemplateWorkspaceMeta(
                    normalizeTemplateWorkspaceMeta(templateSessionMeta)
                );
                return;
            }

            try {
                const ref = doc(db, "borradores", slugInvitacion);
                const snap = await getDoc(ref);

                if (snap.exists()) {
                    const data = snap.data();
                    setNombreBorrador(data?.nombre || draftDisplayName || "Sin nombre");
                    setTemplateWorkspaceMeta(
                        normalizeTemplateWorkspaceMeta(data?.templateWorkspace)
                    );
                    return;
                }
            } catch (error) {
                console.error("Error cargando nombre del borrador:", error);
            }

            setNombreBorrador(draftDisplayName || "Sin nombre");
            setTemplateWorkspaceMeta(normalizeTemplateWorkspaceMeta(null));
        };

        cargarNombre();
    }, [
        draftDisplayName,
        editorReadOnly,
        isTemplateSession,
        slugInvitacion,
        templateSessionMeta,
    ]);

    useEffect(() => {
        const handlePointerDownOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setMenuAbierto(false);
            }
        };

        document.addEventListener("pointerdown", handlePointerDownOutside);
        return () =>
            document.removeEventListener("pointerdown", handlePointerDownOutside);
    }, []);

    useEffect(() => {
        if (slugInvitacion && isMobile) {
            setMenuAbierto(false);
        }
    }, [isMobile, slugInvitacion]);

    const guardarPlantilla = async () => {
        const templateId = normalizeText(slugInvitacion);
        const nombre = isTemplateSession
            ? normalizeText(templateWorkspaceMeta.templateName) || "Plantilla"
            : prompt("Que nombre queres darle a la nueva plantilla?");
        if (!nombre || !templateId) return;

        try {
            if (typeof ensureEditorFlushBeforeAction === "function") {
                const flushResult = await ensureEditorFlushBeforeAction(
                    isTemplateSession
                        ? "template-save-before-preview"
                        : "draft-convert-before-template"
                );
                if (!flushResult?.ok) {
                    throw new Error(
                        flushResult?.error ||
                            "No se pudo confirmar el guardado reciente del editor."
                    );
                }
            }

            const getTemplateAuthoringStatus = readCanvasEditorMethod(
                "getTemplateAuthoringStatus"
            );
            const getTemplateAuthoringSnapshot = readCanvasEditorMethod(
                "getTemplateAuthoringSnapshot"
            );
            const repairTemplateAuthoringState = readCanvasEditorMethod(
                "repairTemplateAuthoringState"
            );
            let runtimeAuthoringStatus = getTemplateAuthoringStatus
                ? getTemplateAuthoringStatus()
                : null;
            let runtimeAuthoringSnapshot = getTemplateAuthoringSnapshot
                ? getTemplateAuthoringSnapshot()
                : null;
            let authoringRepairSummary = "";

            if (
                runtimeAuthoringStatus &&
                runtimeAuthoringStatus.isReady === false &&
                typeof repairTemplateAuthoringState === "function"
            ) {
                const repairResult =
                    await repairTemplateAuthoringState({
                        dropOrphans: true,
                    });

                if (repairResult && typeof repairResult === "object") {
                    runtimeAuthoringStatus =
                        repairResult.status && typeof repairResult.status === "object"
                            ? repairResult.status
                            : runtimeAuthoringStatus;
                    runtimeAuthoringSnapshot =
                        repairResult.snapshot && typeof repairResult.snapshot === "object"
                            ? repairResult.snapshot
                            : runtimeAuthoringSnapshot;

                    const removedTargetCount = Array.isArray(repairResult.removedTargets)
                        ? repairResult.removedTargets.length
                        : 0;
                    const removedFieldCount = Array.isArray(repairResult.removedFieldKeys)
                        ? repairResult.removedFieldKeys.length
                        : 0;

                    if (removedTargetCount > 0 || removedFieldCount > 0) {
                        const repairNotes = [];
                        if (removedTargetCount > 0) {
                            repairNotes.push(
                                `${removedTargetCount} vinculo(s) roto(s)`
                            );
                        }
                        if (removedFieldCount > 0) {
                            repairNotes.push(
                                `${removedFieldCount} campo(s) huerfano(s)`
                            );
                        }
                        authoringRepairSummary = repairNotes.join(" y ");
                    }
                }
            }

            if (runtimeAuthoringStatus && runtimeAuthoringStatus.isReady === false) {
                const issues = Array.isArray(runtimeAuthoringStatus.issues)
                    ? runtimeAuthoringStatus.issues
                    : [];
                const preview = issues.slice(0, 4);
                const body = preview.length
                    ? `- ${preview.join("\n- ")}`
                    : "- Revisa defaults y applyTargets.";
                const extra =
                    issues.length > 4 ? `\n... y ${issues.length - 4} mas.` : "";
                alert(
                    `No se puede guardar plantilla porque el schema dinamico no esta listo.\n${body}${extra}`
                );
                return;
            }

            const stage = readCanvasEditorStage();
            if (!stage) {
                alert("El editor no esta listo todavia.");
                return;
            }

            const dataURL = stage.toDataURL({ pixelRatio: 2 });
            const res = await fetch(dataURL);
            const blob = await res.blob();

            const storage = (await import("firebase/storage")).getStorage();
            const previewRef = (await import("firebase/storage")).ref(
                storage,
                `previews/plantillas/${templateId}.png`
            );
            await (await import("firebase/storage")).uploadBytes(previewRef, blob);

            const portada = await (
                await import("firebase/storage")
            ).getDownloadURL(previewRef);
            const liveEditorSnapshot = readEditorRenderSnapshot();
            if (liveEditorSnapshot) {
                recordTemplateDashboardCardSnapshot(liveEditorSnapshot, templateId);
            }

            if (isTemplateSession) {
                await saveTemplateEditorDocument({
                    templateId,
                    document: {
                        nombre,
                        portada,
                        ...(runtimeAuthoringSnapshot
                            ? {
                                  templateAuthoringDraft: runtimeAuthoringSnapshot,
                              }
                            : {}),
                        ...(liveEditorSnapshot
                            ? {
                                  objetos: liveEditorSnapshot.objetos,
                                  secciones: liveEditorSnapshot.secciones,
                                  rsvp: liveEditorSnapshot.rsvp,
                                  gifts: liveEditorSnapshot.gifts,
                              }
                            : {}),
                    },
                });
                await captureCountdownAuditTemplateDocument(
                    templateId,
                    "template-persisted-document"
                );
                alert(
                    authoringRepairSummary
                        ? `La plantilla se actualizo correctamente.\n\nSe reparo el schema dinamico removiendo ${authoringRepairSummary}.`
                        : "La plantilla se actualizo correctamente."
                );
                return;
            }

            const ref = doc(db, "borradores", templateId);
            const snap = await getDoc(ref);
            if (!snap.exists()) throw new Error("No se encontro el borrador.");

            const dataBase = snap.data();
            const data =
                liveEditorSnapshot && dataBase && typeof dataBase === "object"
                    ? {
                          ...dataBase,
                          objetos: liveEditorSnapshot.objetos,
                          secciones: liveEditorSnapshot.secciones,
                          rsvp: liveEditorSnapshot.rsvp,
                          gifts: liveEditorSnapshot.gifts,
                      }
                    : dataBase;
            const stagedAuthoringSnapshot =
                data?.templateAuthoringDraft &&
                typeof data.templateAuthoringDraft === "object"
                    ? data.templateAuthoringDraft
                    : null;
            const authoringStatusToValidate =
                runtimeAuthoringStatus && typeof runtimeAuthoringStatus === "object"
                    ? runtimeAuthoringStatus
                    : stagedAuthoringSnapshot?.status || null;
            const payload = buildTemplatePayloadFromAuthoring({
                draftData: data,
                authoringState:
                    runtimeAuthoringSnapshot || stagedAuthoringSnapshot || null,
            });
            recordTemplateDashboardCardSnapshot(data, templateId);

            const conversionResult = await convertDraftToTemplate({
                draftSlug: templateId,
                authoringStatus: authoringStatusToValidate || null,
                datos: {
                    ...payload,
                    nombre,
                    portada,
                },
            });
            await captureCountdownAuditTemplateDocument(
                templateId,
                "template-persisted-document"
            );

            if (typeof onOpenTemplateSession === "function") {
                onOpenTemplateSession({
                    templateId,
                    item:
                        conversionResult?.item &&
                        typeof conversionResult.item === "object"
                            ? conversionResult.item
                            : null,
                    editorDocument:
                        conversionResult?.editorDocument &&
                        typeof conversionResult.editorDocument === "object"
                            ? conversionResult.editorDocument
                            : null,
                });
            }

            await router.replace(
                `/dashboard?templateId=${encodeURIComponent(templateId)}`
            );
            alert("El borrador se convirtio en plantilla en estado En proceso.");
        } catch (error) {
            console.error("Error al guardar plantilla:", error);
            alert(error?.message || "Ocurrio un error al guardar la plantilla.");
        }
    };

    const guardarNombreDocumento = async () => {
        const currentId = normalizeText(slugInvitacion);
        if (!currentId) return;

        if (isTemplateSession) {
            await saveTemplateEditorDocument({
                templateId: currentId,
                document: {
                    nombre: nombreBorrador,
                },
            });
            setTemplateWorkspaceMeta((previous) => ({
                ...previous,
                templateName: normalizeText(nombreBorrador) || previous.templateName,
            }));
            return;
        }

        const ref = doc(db, "borradores", currentId);
        await updateDoc(ref, {
            nombre: nombreBorrador,
        });
    };

    const abrirModalCrearSeccion = () => {
        if (typeof window === "undefined") return;
        window.dispatchEvent(new CustomEvent("dashboard-abrir-modal-seccion"));
    };

    const crearPlantillaDesdeHeader = () => {
        if (typeof window === "undefined") return;
        window.dispatchEvent(new CustomEvent("dashboard-crear-plantilla"));
    };

    const abrirPanelCreativo = () => {
        router.push("/admin/panel-creativo");
    };

    const previewButtonLabel = isTemplateSession
        ? "Vista previa"
        : "Publicar";
    const documentNameLabel = isTemplateSession
        ? "Nombre de la plantilla"
        : "Nombre del borrador";
    const documentNameTitle = isTemplateSession
        ? "Editar nombre de la plantilla"
        : "Editar nombre del borrador";
    const canShowReadOnlyPreview = editorReadOnly && isTemplateSession;
    const backNavigationTarget = isTemplateSession
        ? "/admin/plantillas/"
        : "/dashboard";
    const documentDisplayName =
        normalizeText(nombreBorrador) || (isTemplateSession ? "Plantilla" : "Sin nombre");
    const documentTypeBadgeLabel = isTemplateSession ? "Plantilla" : "Borrador";
    const showMobilePreviewButton = !editorReadOnly || canShowReadOnlyPreview;
    const showDesktopPreviewButton = !editorReadOnly || canShowReadOnlyPreview;
    const showStandaloneUserMenu = !(slugInvitacion && isMobile);
    const showEditorAdminMenuActions =
        Boolean(slugInvitacion) && !loadingAdminAccess && canManageSite && !editorReadOnly;
    const dashboardModeButton =
        "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d9c5f6]";
    const userMenuActionButton =
        "group mx-2 my-1 flex w-[calc(100%-1rem)] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300";

    const handleEditorBack = () => {
        markEditorSessionIntentionalExit({
            slug: slugInvitacion || null,
            reason: "header-back-button",
        });
        setSlugInvitacion(null);
        setModoEditor(null);
        onCambiarVista?.("home");
        router.replace(backNavigationTarget, undefined, { shallow: true });
    };

    const handleLogout = async () => {
        const { getAuth, signOut } = await import("firebase/auth");
        const auth = getAuth();
        await signOut(auth);
        window.location.href = "/";
    };

    return (
        /* Runtime-sensitive hooks: editor overlays and selection preservation
           depend on these attributes. Keep them stable during visual cleanup. */
        <div
            ref={headerRef}
            data-dashboard-header="true"
            data-preserve-canvas-selection="true"
            className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between border-b border-gray-200 bg-white px-3 py-2 shadow-sm md:px-4"
        >
            {slugInvitacion ? (
                <CanvasEditorHeader
                    isMobile={isMobile}
                    editorReadOnly={editorReadOnly}
                    historialExternos={historialExternos}
                    futurosExternos={futurosExternos}
                    documentDisplayName={documentDisplayName}
                    documentTypeBadgeLabel={documentTypeBadgeLabel}
                    documentNameLabel={documentNameLabel}
                    documentNameTitle={documentNameTitle}
                    nombreBorrador={nombreBorrador}
                    setNombreBorrador={setNombreBorrador}
                    guardarNombreDocumento={guardarNombreDocumento}
                    previewButtonLabel={previewButtonLabel}
                    showDesktopPreviewButton={showDesktopPreviewButton}
                    showMobilePreviewButton={showMobilePreviewButton}
                    generarVistaPrevia={generarVistaPrevia}
                    handleEditorBack={handleEditorBack}
                    handleLogout={handleLogout}
                    AccountSummaryComponent={AccountSummary}
                    usuario={usuario}
                    inicialUsuario={inicialUsuario}
                    nombreCompletoUsuario={nombreCompletoUsuario}
                    emailUsuario={emailUsuario}
                />
            ) : (
                <div className="flex flex-1 items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <img src="/assets/img/logo.png" alt="Logo" className="h-5" />
                        <span className="hidden text-xs font-semibold text-gray-700 sm:block">
                            DASHBOARD
                        </span>
                    </div>

                    <div className="mr-2 flex items-center gap-2">
                        <button
                            onClick={() =>
                                onCambiarVista(
                                    vistaActual === "publicadas" ||
                                        vistaActual === "papelera"
                                        ? "home"
                                        : "publicadas"
                                )
                            }
                            className={`${dashboardModeButton} ${
                                vistaActual === "publicadas" ||
                                vistaActual === "papelera"
                                    ? "border-[#d9c5f6] bg-[#f7f1ff] text-[#6f3bc0] shadow-[0_10px_22px_rgba(119,61,190,0.18)] hover:bg-[#f3ebff]"
                                    : "border-[#e6dbf8] bg-white text-slate-700 shadow-[0_6px_16px_rgba(15,23,42,0.06)] hover:-translate-y-[1px] hover:border-[#d5c6f2] hover:bg-[#faf6ff] hover:text-[#5f3596] hover:shadow-[0_12px_24px_rgba(119,61,190,0.14)]"
                            }`}
                            title={
                                vistaActual === "publicadas" ||
                                vistaActual === "papelera"
                                    ? "Volver al inicio del dashboard"
                                    : "Ver tus invitaciones publicadas"
                            }
                        >
                            {vistaActual === "publicadas" || vistaActual === "papelera"
                                ? "Volver al dashboard"
                                : "Mis invitaciones publicadas"}
                        </button>

                        {!loadingAdminAccess && canManageSite ? (
                            <button
                                onClick={abrirPanelCreativo}
                                className={`${dashboardModeButton} border-[#e6dbf8] bg-white text-slate-700 shadow-[0_6px_16px_rgba(15,23,42,0.06)] hover:-translate-y-[1px] hover:border-[#d5c6f2] hover:bg-[#faf6ff] hover:text-[#5f3596] hover:shadow-[0_12px_24px_rgba(119,61,190,0.14)]`}
                                title="Abrir panel creativo"
                            >
                                Panel creativo
                            </button>
                        ) : null}

                        {!loadingAdminAccess && isSuperAdmin ? (
                            <button
                                onClick={() =>
                                    onCambiarVista(
                                        vistaActual === "gestion" ? "home" : "gestion"
                                    )
                                }
                                className={`${dashboardModeButton} ${
                                    vistaActual === "gestion"
                                        ? "border-[#d9c5f6] bg-[#f7f1ff] text-[#6f3bc0] shadow-[0_10px_22px_rgba(119,61,190,0.18)] hover:bg-[#f3ebff]"
                                        : "border-[#e6dbf8] bg-white text-slate-700 shadow-[0_6px_16px_rgba(15,23,42,0.06)] hover:-translate-y-[1px] hover:border-[#d5c6f2] hover:bg-[#faf6ff] hover:text-[#5f3596] hover:shadow-[0_12px_24px_rgba(119,61,190,0.14)]"
                                }`}
                                title={
                                    vistaActual === "gestion"
                                        ? "Volver al inicio del dashboard"
                                        : isSuperAdmin
                                          ? "Abrir tablero de gestion (superadmin)"
                                          : "Abrir tablero de gestion (admin)"
                                }
                            >
                                {vistaActual === "gestion"
                                    ? "Volver al dashboard"
                                    : "Gestion del sitio"}
                            </button>
                        ) : null}
                    </div>
                </div>
            )}

            {showStandaloneUserMenu ? (
                <div className="relative ml-2" ref={menuRef}>
                    <div
                        className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-1.5 py-1 transition-all duration-200 ${
                            menuAbierto
                                ? "border-purple-300 bg-purple-50 shadow-sm ring-2 ring-purple-200"
                                : "border-gray-200 bg-white hover:bg-gray-50 hover:shadow-sm"
                        }`}
                        onClick={() => setMenuAbierto((prev) => !prev)}
                        role="button"
                        tabIndex={0}
                        aria-haspopup="menu"
                        aria-expanded={menuAbierto}
                        aria-label="Abrir menu de usuario"
                        onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setMenuAbierto((prev) => !prev);
                            }
                        }}
                    >
                        {usuario?.photoURL ? (
                            <img
                                src={usuario.photoURL}
                                alt="Foto de perfil"
                                className="h-7 w-7 rounded-full object-cover transition-transform duration-200 hover:scale-105"
                                title={usuario.displayName || usuario.email || "Usuario"}
                            />
                        ) : (
                            <div
                                className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white transition-transform duration-200 hover:scale-105"
                                style={{ backgroundColor: "#773dbe" }}
                                title={usuario?.displayName || usuario?.email || "Usuario"}
                            >
                                {inicialUsuario}
                            </div>
                        )}
                        <ChevronDown
                            className={`text-gray-600 transition-transform duration-200 ${
                                menuAbierto ? "rotate-180" : ""
                            }`}
                            size={14}
                        />
                    </div>

                    {menuAbierto ? (
                        <div className="absolute right-0 z-50 mt-2 w-72 max-w-[88vw] origin-top-right overflow-hidden rounded-xl border border-gray-200 bg-white py-1 text-xs shadow-xl animate-fade-slide">
                            <div className="border-b border-gray-100 bg-gradient-to-r from-purple-50 via-white to-white px-3 py-2">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                                    Cuenta
                                </p>
                                <AccountSummary
                                    usuario={usuario}
                                    inicialUsuario={inicialUsuario}
                                    nombreCompletoUsuario={nombreCompletoUsuario}
                                    emailUsuario={emailUsuario}
                                />
                            </div>

                            {!slugInvitacion ? (
                                <button
                                    onClick={() => {
                                        onCambiarVista?.("papelera");
                                        setMenuAbierto(false);
                                    }}
                                    className={userMenuActionButton}
                                >
                                    <Trash2 size={14} className="shrink-0" />
                                    <span className="truncate">Papelera</span>
                                </button>
                            ) : null}

                            {showEditorAdminMenuActions ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            abrirModalCrearSeccion();
                                            setMenuAbierto(false);
                                        }}
                                        className={userMenuActionButton}
                                    >
                                        <Plus size={14} className="shrink-0" />
                                        <span className="truncate">Anadir seccion</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            crearPlantillaDesdeHeader();
                                            setMenuAbierto(false);
                                        }}
                                        className={userMenuActionButton}
                                    >
                                        <Sparkles size={14} className="shrink-0" />
                                        <span className="truncate">Crear plantilla</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setMenuAbierto(false);
                                            void guardarPlantilla();
                                        }}
                                        className={userMenuActionButton}
                                    >
                                        <Sparkles size={14} className="shrink-0" />
                                        <span className="truncate">
                                            {isTemplateSession
                                                ? "Guardar cambios"
                                                : "Guardar plantilla"}
                                        </span>
                                    </button>
                                </>
                            ) : null}

                            <button
                                onClick={() => void handleLogout()}
                                className="group mx-2 my-1 flex w-[calc(100%-1rem)] items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-left font-medium text-red-700 transition hover:border-red-200 hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                            >
                                <LogOut size={14} className="shrink-0" />
                                <span className="truncate">Cerrar sesion</span>
                            </button>
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
