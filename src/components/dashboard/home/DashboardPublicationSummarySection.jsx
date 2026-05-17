import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildDashboardDraftSummary,
  buildDashboardPublicationSummary,
  selectLatestActiveDashboardPublication,
} from "@/domain/publications/dashboardSummary";
import { copyPublicationUrlToClipboard } from "@/domain/publications/share";
import { useDashboardPublicationRsvpSummary } from "@/hooks/useDashboardPublicationRsvpSummary";
import styles from "./DashboardPublicationSummarySection.module.css";

function normalizeCandidates(candidates = []) {
  return Array.isArray(candidates) ? candidates.filter(Boolean) : [];
}

function PublicationPreviewImage({ candidates, alt, onAllFailed }) {
  const safeCandidates = useMemo(
    () => normalizeCandidates(candidates),
    [candidates]
  );
  const candidateKey = safeCandidates.join("||");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [failedAll, setFailedAll] = useState(safeCandidates.length === 0);

  useEffect(() => {
    setCurrentIndex(0);
    setFailedAll(safeCandidates.length === 0);
  }, [candidateKey, safeCandidates.length]);

  if (failedAll || !safeCandidates[currentIndex]) {
    return null;
  }

  return (
    <img
      src={safeCandidates[currentIndex]}
      alt={alt}
      className={styles.dashboardPublicationPreviewImage}
      loading="lazy"
      onError={() => {
        setCurrentIndex((previous) => {
          const nextIndex = previous + 1;
          if (nextIndex >= safeCandidates.length) {
            setFailedAll(true);
            onAllFailed?.();
            return previous;
          }
          return nextIndex;
        });
      }}
    />
  );
}

export default function DashboardPublicationSummarySection({
  publications,
  drafts,
  loading = false,
  loadingDrafts = false,
  onOpenResponses,
  onOpenDraft,
  onViewInvitations,
}) {
  const publicationSummary = useMemo(
    () => buildDashboardPublicationSummary(publications),
    [publications]
  );
  const hasActivePublication = useMemo(
    () => Boolean(selectLatestActiveDashboardPublication(publications)),
    [publications]
  );
  const draftSummary = useMemo(
    () => (hasActivePublication ? null : buildDashboardDraftSummary(drafts)),
    [drafts, hasActivePublication]
  );
  const summary = publicationSummary || draftSummary;
  const summaryMode = publicationSummary ? "publication" : draftSummary ? "draft" : "";
  const rsvpSummary = useDashboardPublicationRsvpSummary({
    publication: publicationSummary?.publication || null,
  });
  const previewKey = summary?.previewCandidates?.join("||") || "";
  const [previewFailed, setPreviewFailed] = useState(false);
  const [shareState, setShareState] = useState("idle");

  useEffect(() => {
    setPreviewFailed(false);
  }, [previewKey]);

  useEffect(() => {
    if (shareState !== "copied") return undefined;
    const timeoutId = window.setTimeout(() => {
      setShareState("idle");
    }, 1600);
    return () => window.clearTimeout(timeoutId);
  }, [shareState]);

  const handleOpenResponses = useCallback(() => {
    if (!publicationSummary?.publicSlug) return;
    onOpenResponses?.(publicationSummary.publicSlug);
  }, [onOpenResponses, publicationSummary?.publicSlug]);

  const handleShare = useCallback(async () => {
    if (!publicationSummary?.publicUrl) return;

    try {
      await copyPublicationUrlToClipboard(publicationSummary.publicUrl);
      setShareState("copied");
    } catch (error) {
      console.warn("No se pudo copiar el enlace de la publicacion", error);
      setShareState("idle");
    }
  }, [publicationSummary?.publicUrl]);

  const handleOpenDraft = useCallback(() => {
    if (!draftSummary?.draft) return;
    onOpenDraft?.(draftSummary.draft);
  }, [draftSummary?.draft, onOpenDraft]);

  if (loading || loadingDrafts || !summary || previewFailed) {
    return null;
  }

  if (
    summaryMode === "publication" &&
    (!rsvpSummary.ready || rsvpSummary.error)
  ) {
    return null;
  }

  return (
    <section
      className={styles.dashboardPublicationSummary}
      aria-labelledby="dashboard-publication-summary-title"
    >
      <div className={styles.dashboardPublicationSummaryInner}>
        <div className={styles.dashboardPublicationSummaryContent}>
          <h2
            id="dashboard-publication-summary-title"
            className={styles.dashboardPublicationSummaryTitle}
          >
            {summaryMode === "draft"
              ? "Estás a un paso de enviar tu invitación."
              : "El resumen de tu casamiento en tiempo real."}
          </h2>
          <p className={styles.dashboardPublicationSummarySubtitle}>
            {summaryMode === "draft"
              ? "Retomá el diseño donde lo dejaste y empezá a compartirlo con tus invitados."
              : `Publicaste tu invitación el ${summary.publishedDateLabel}`}
          </p>
        </div>

        <div className={styles.dashboardPublicationVisual}>
          <div className={styles.dashboardPublicationPreview}>
            <PublicationPreviewImage
              candidates={summary.previewCandidates}
              alt={`Preview de ${summary.title}`}
              onAllFailed={() => setPreviewFailed(true)}
            />
          </div>

          <article className={styles.dashboardPublicationCard}>
            <div className={styles.dashboardPublicationInfo}>
              <h3 className={styles.dashboardPublicationEventTitle}>
                {summary.title}
              </h3>

              {summaryMode === "draft" ? (
                <>
                  <p className={styles.dashboardDraftUpdatedText}>
                    Última edición el {summary.updatedDateLabel}
                  </p>

                  <div className={styles.dashboardDraftActions}>
                    <button
                      type="button"
                      className={`${styles.dashboardPublicationPrimaryAction} ${styles.dashboardDraftPrimaryAction}`}
                      onClick={handleOpenDraft}
                    >
                      Continuar edición
                    </button>
                    <button
                      type="button"
                      className={`${styles.dashboardPublicationSecondaryAction} ${styles.dashboardDraftSecondaryAction}`}
                      onClick={onViewInvitations}
                    >
                      Mis invitaciones
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.dashboardPublicationStatusRow}>
                    <span className={styles.dashboardPublicationStatus}>
                      Activa
                    </span>
                    <span className={styles.dashboardPublicationDate}>
                      {summary.publishedDateLabel}
                    </span>
                  </div>

                  <div className={styles.dashboardPublicationStats}>
                    <div className={styles.dashboardPublicationStat}>
                      <span className={styles.dashboardPublicationStatNumber}>
                        {rsvpSummary.attendingResponses}
                      </span>
                      <span
                        className={`${styles.dashboardPublicationStatLabel} ${styles.dashboardPublicationStatLabelAttend}`}
                      >
                        Asisten
                      </span>
                    </div>

                    <div className={styles.dashboardPublicationStat}>
                      <span className={styles.dashboardPublicationStatNumber}>
                        {rsvpSummary.declinedResponses}
                      </span>
                      <span
                        className={`${styles.dashboardPublicationStatLabel} ${styles.dashboardPublicationStatLabelDecline}`}
                      >
                        No asisten
                      </span>
                    </div>
                  </div>

                  <div className={styles.dashboardPublicationActions}>
                    <button
                      type="button"
                      className={styles.dashboardPublicationPrimaryAction}
                      onClick={handleOpenResponses}
                    >
                      Ver respuestas
                    </button>
                    <button
                      type="button"
                      className={styles.dashboardPublicationSecondaryAction}
                      onClick={handleShare}
                    >
                      {shareState === "copied" ? "Copiado" : "Compartir"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
