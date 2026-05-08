import { useEffect, useRef, useState } from "react";
import {
    LogOut,
    MoreHorizontal,
    Redo2,
    Undo2,
    X,
} from "lucide-react";
import {
    triggerEditorRedo,
    triggerEditorUndo,
} from "@/utils/editorHistoryControls";

const closeEditorButtonClass =
    "mr-[30px] inline-flex h-[28px] w-[20px] shrink-0 items-center justify-center border-0 bg-transparent p-0 font-['Font_Awesome_5_Pro',sans-serif] text-[28px] font-light leading-[28px] tracking-[0px] text-[#262626] shadow-none transition hover:text-black focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300";
const primaryHeaderButton =
    "inline-flex h-[38px] min-w-[122px] items-center justify-center rounded-[33px] border border-transparent bg-gradient-to-r from-[#692B9A] to-[#F39F5F] px-[30px] pb-2 pt-1.5 text-xs font-semibold text-white shadow-none transition-all duration-200 hover:brightness-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F39F5F]/40";
const previewHeaderButton =
    "inline-flex h-[23px] min-w-[94px] items-center justify-center whitespace-nowrap border-0 bg-transparent px-0 font-['DM_Sans',sans-serif] text-[13px] font-medium uppercase leading-[23px] tracking-[1px] text-[#262626] shadow-none transition-all duration-200 hover:bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300";
const previewHeaderDivider =
    "mr-[25px] hidden h-[28px] w-px shrink-0 bg-[#00000029] md:block";
const desktopDocumentShellClass =
    "flex min-w-0 items-center gap-[13px]";
const desktopDocumentBadgeClass =
    "inline-flex h-[30px] w-[81px] shrink-0 items-center justify-center rounded-[33px] border-0 bg-[#E5E5E5] pb-1 pl-[11px] pr-[11px] pt-0.5 font-['DM_Sans',sans-serif] text-[14px] font-medium leading-[24px] tracking-[0px] text-[#262626]";
const desktopReadOnlyNameClass =
    "truncate font-['Source_Sans_Pro',sans-serif] text-[16px] font-normal italic leading-[24px] tracking-[0px] text-[#262626]";
const desktopHistoryButtonClass =
    "inline-flex h-[28px] w-[28px] items-center justify-center border-0 bg-transparent p-0 text-[#692B9A] shadow-none transition hover:bg-[#692B9A]/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d9c5f6]";
const mobileIconButtonClass =
    "inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#e6dbf8] bg-white text-[#6f3bc0] shadow-[0_8px_18px_rgba(15,23,42,0.08)] transition hover:border-[#d5c6f2] hover:bg-[#faf6ff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d9c5f6]";

export default function CanvasEditorHeader({
    isMobile,
    editorReadOnly,
    historialExternos,
    futurosExternos,
    documentDisplayName,
    documentTypeBadgeLabel,
    documentNameLabel,
    documentNameTitle,
    nombreBorrador,
    setNombreBorrador,
    guardarNombreDocumento,
    previewButtonLabel,
    showDesktopPreviewButton,
    showMobilePreviewButton,
    generarVistaPrevia,
    handleEditorBack,
    handleLogout,
    AccountSummaryComponent,
    usuario,
    inicialUsuario,
    nombreCompletoUsuario,
    emailUsuario,
}) {
    const accionesMobileRef = useRef(null);
    const [accionesMobileAbiertas, setAccionesMobileAbiertas] = useState(false);
    const canUndo = !editorReadOnly && historialExternos.length > 1;
    const canRedo = !editorReadOnly && futurosExternos.length > 0;

    useEffect(() => {
        if (!isMobile) {
            setAccionesMobileAbiertas(false);
        }
    }, [isMobile]);

    return (
        <>
            <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3">
                <button
                    onClick={handleEditorBack}
                    className={closeEditorButtonClass}
                    aria-label="Volver al dashboard"
                    title="Cerrar editor"
                >
                    <span aria-hidden="true">&times;</span>
                </button>

                {isMobile ? (
                    <div className="min-w-0 flex-1">
                        <p
                            className="truncate text-sm font-semibold text-slate-800"
                            title={documentDisplayName}
                        >
                            {documentDisplayName}
                        </p>
                    </div>
                ) : (
                    <div className="min-w-0">
                        <div className={desktopDocumentShellClass}>
                            <span className={desktopDocumentBadgeClass}>
                                {documentTypeBadgeLabel}
                            </span>
                            <div
                                className={desktopReadOnlyNameClass}
                                title={documentNameTitle}
                            >
                                {documentDisplayName}
                            </div>
                        </div>
                    </div>
                )}

                <div className="ml-auto flex shrink-0 items-center gap-2">
                    {!isMobile && editorReadOnly ? (
                        <span className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-slate-100 px-3 text-xs font-semibold text-slate-600">
                            Modo solo lectura
                        </span>
                    ) : null}

                    {showDesktopPreviewButton ? (
                        <>
                            <button
                                onClick={triggerEditorUndo}
                                disabled={!canUndo}
                                className={`${desktopHistoryButtonClass} hidden md:inline-flex ${
                                    canUndo
                                        ? ""
                                        : "cursor-not-allowed text-slate-300 hover:bg-transparent"
                                }`}
                                title="Deshacer"
                            >
                                <Undo2 className="h-6 w-6" />
                            </button>
                            <button
                                onClick={triggerEditorRedo}
                                disabled={!canRedo}
                                className={`${desktopHistoryButtonClass} mr-[25px] hidden md:inline-flex ${
                                    canRedo
                                        ? ""
                                        : "cursor-not-allowed text-slate-300 hover:bg-transparent"
                                }`}
                                title="Rehacer"
                            >
                                <Redo2 className="h-6 w-6" />
                            </button>
                            <span
                                className={previewHeaderDivider}
                                aria-hidden="true"
                            />
                            <button
                                onClick={generarVistaPrevia}
                                className={`${previewHeaderButton} hidden md:inline-flex`}
                            >
                                Vista previa
                            </button>
                            <button
                                onClick={generarVistaPrevia}
                                className={`${primaryHeaderButton} ml-[16px] hidden h-10 px-4 md:inline-flex`}
                            >
                                {previewButtonLabel}
                            </button>
                        </>
                    ) : null}

                    {showMobilePreviewButton ? (
                        <button
                            onClick={generarVistaPrevia}
                            className={`${primaryHeaderButton} h-10 px-3.5 text-[11px] md:hidden`}
                        >
                            Vista previa
                        </button>
                    ) : null}

                    <button
                        type="button"
                        onClick={() => setAccionesMobileAbiertas((prev) => !prev)}
                        className={`${mobileIconButtonClass} md:hidden`}
                        aria-label="Abrir opciones del editor"
                        title="Mas opciones"
                    >
                        <MoreHorizontal className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {accionesMobileAbiertas ? (
                <div className="fixed inset-0 z-40 md:hidden">
                    <button
                        type="button"
                        className="absolute inset-0 bg-slate-950/28 backdrop-blur-[2px]"
                        aria-label="Cerrar opciones del editor"
                        onClick={() => setAccionesMobileAbiertas(false)}
                    />

                    <div
                        ref={accionesMobileRef}
                        className="absolute inset-x-0 bottom-0 rounded-t-[28px] border border-[#e7dcf8] bg-white px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-4 shadow-[0_-24px_60px_rgba(15,23,42,0.2)]"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Opciones del editor"
                    >
                        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[#d8ccea]" />
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-sm font-semibold text-slate-800">
                                    Opciones del editor
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                    Ajustes y acciones secundarias del borrador.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setAccionesMobileAbiertas(false)}
                                className={mobileIconButtonClass}
                                aria-label="Cerrar opciones del editor"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {editorReadOnly ? (
                            <div className="mt-4 inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600">
                                Solo lectura
                            </div>
                        ) : null}

                        <div className="mt-4 rounded-[24px] border border-[#e7dcf8] bg-gradient-to-br from-white via-[#faf6ff] to-[#f4f8ff] p-4">
                            <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                {documentNameLabel}
                            </label>
                            {editorReadOnly ? (
                                <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-medium text-slate-700">
                                    {documentDisplayName}
                                </div>
                            ) : (
                                <input
                                    type="text"
                                    value={nombreBorrador}
                                    onChange={(e) => setNombreBorrador(e.target.value)}
                                    onBlur={() => void guardarNombreDocumento()}
                                    className="mt-2 h-12 w-full rounded-2xl border border-[#ddd2f5] bg-white px-3 text-sm font-medium text-slate-800 shadow-[0_10px_24px_rgba(15,23,42,0.06)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d8c3f5]"
                                    placeholder="Sin nombre"
                                />
                            )}
                        </div>

                        <div className="mt-4 rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                Cuenta
                            </p>
                            <AccountSummaryComponent
                                usuario={usuario}
                                inicialUsuario={inicialUsuario}
                                nombreCompletoUsuario={nombreCompletoUsuario}
                                emailUsuario={emailUsuario}
                                avatarSizeClass="h-11 w-11"
                                textClass="text-sm"
                            />
                            <button
                                type="button"
                                onClick={() => void handleLogout()}
                                className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-red-100 bg-red-50 px-3 py-3 text-sm font-semibold text-red-700 transition hover:border-red-200 hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                            >
                                <LogOut className="h-4 w-4" />
                                Cerrar sesion
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
}
