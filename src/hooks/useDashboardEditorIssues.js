import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions as cloudFunctions } from "@/firebase";
import { getErrorMessage } from "@/domain/dashboard/helpers";
import {
  buildEditorIssueTransportPayload,
  clearPendingEditorIssue,
  consumeInterruptedEditorSession,
  installGlobalEditorIssueHandlers,
  pushEditorBreadcrumb,
  readPendingEditorIssue,
  startEditorSessionWatchdog,
} from "@/lib/monitoring/editorIssueReporter";

export function useDashboardEditorIssues({
  routerReady = false,
  querySlug = null,
  activeSlug = null,
  vista = "home",
  modoEditor = null,
} = {}) {
  const [editorIssueReport, setEditorIssueReport] = useState(null);
  const [sendingIssueReport, setSendingIssueReport] = useState(false);
  const [issueSendError, setIssueSendError] = useState("");
  const [sentIssueId, setSentIssueId] = useState(null);
  const attemptedAutoSendRef = useRef(new Set());

  const reportClientIssueCallable = useMemo(
    () => httpsCallable(cloudFunctions, "reportClientIssue"),
    []
  );

  const handleDismissEditorIssue = useCallback(() => {
    clearPendingEditorIssue();
    setEditorIssueReport(null);
    setIssueSendError("");
    setSentIssueId(null);
  }, []);

  const handleCopyEditorIssue = useCallback(async () => {
    if (!editorIssueReport) return;
    const payload = JSON.stringify(editorIssueReport, null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      alert("Reporte copiado al portapapeles.");
    } catch {
      alert(payload);
    }
  }, [editorIssueReport]);

  const handleSendEditorIssue = useCallback(
    async (reportOverride = null) => {
      const reportToSend = reportOverride || editorIssueReport;
      if (!reportToSend || sendingIssueReport) return;

      setSendingIssueReport(true);
      setIssueSendError("");

      try {
        const result = await reportClientIssueCallable({
          report: buildEditorIssueTransportPayload(reportToSend),
        });
        const issueId = result?.data?.issueId || null;
        if (issueId) {
          setSentIssueId(issueId);
        }
        if (!reportOverride || reportOverride === editorIssueReport) {
          clearPendingEditorIssue();
        }
        pushEditorBreadcrumb("issue-report-sent", {
          issueId: issueId || null,
          source: reportToSend?.source || null,
        });
      } catch (error) {
        setIssueSendError(getErrorMessage(error, "No se pudo enviar el reporte."));
        pushEditorBreadcrumb("issue-report-send-error", {
          source: reportToSend?.source || null,
          message: getErrorMessage(error, "No se pudo enviar el reporte."),
        });
      } finally {
        setSendingIssueReport(false);
      }
    },
    [editorIssueReport, reportClientIssueCallable, sendingIssueReport]
  );

  useEffect(() => {
    pushEditorBreadcrumb("dashboard-mounted", {});

    const teardownGlobal = installGlobalEditorIssueHandlers();
    const onIssueCaptured = (event) => {
      const report = event?.detail || null;
      if (!report) return;
      setEditorIssueReport(report);
      setIssueSendError("");
      setSentIssueId(null);
    };

    window.addEventListener("editor-issue-captured", onIssueCaptured);

    const pending = readPendingEditorIssue();
    if (pending) {
      setEditorIssueReport(pending);
    }

    return () => {
      teardownGlobal?.();
      window.removeEventListener("editor-issue-captured", onIssueCaptured);
    };
  }, []);

  useEffect(() => {
    if (!routerReady) return;
    consumeInterruptedEditorSession({ currentSlug: querySlug });
  }, [querySlug, routerReady]);

  useEffect(() => {
    if (!activeSlug) return;
    pushEditorBreadcrumb("editor-open", {
      slug: activeSlug,
      vista,
      modoEditor,
    });
  }, [activeSlug, modoEditor, vista]);

  useEffect(() => {
    if (!activeSlug) return undefined;
    const stopWatchdog = startEditorSessionWatchdog({
      slug: activeSlug,
      context: {
        vista,
        modoEditor,
      },
    });

    return () => {
      stopWatchdog("editor-unmounted");
    };
  }, [activeSlug, modoEditor, vista]);

  useEffect(() => {
    if (!editorIssueReport) return;

    const reportKey =
      editorIssueReport.id ||
      `${editorIssueReport.fingerprint || "no-fingerprint"}:${editorIssueReport.occurredAt || "no-time"}`;

    if (attemptedAutoSendRef.current.has(reportKey)) return;
    attemptedAutoSendRef.current.add(reportKey);

    void handleSendEditorIssue(editorIssueReport);
  }, [editorIssueReport, handleSendEditorIssue]);

  return {
    editorIssueReport,
    sendingIssueReport,
    issueSendError,
    sentIssueId,
    handleDismissEditorIssue,
    handleCopyEditorIssue,
    handleSendEditorIssue,
  };
}
