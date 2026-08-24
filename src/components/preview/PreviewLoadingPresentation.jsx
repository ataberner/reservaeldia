const {
  INVITATION_LOADER_PRESENTATION_HTML,
} = require("../../../shared/invitationLoaderPresentation.cjs");

export default function PreviewLoadingPresentation({
  announce = true,
  className = "",
  error = false,
  onRetry = null,
}) {
  return (
    <div
      className={`absolute inset-0 z-10 overflow-hidden ${className}`}
      style={{ contain: "layout paint" }}
      data-preview-loading-authority="frame"
      data-preview-loader-error={error ? "1" : "0"}
      aria-hidden={announce ? undefined : "true"}
      onClick={(event) => {
        if (!event.target?.closest?.("[data-invitation-retry='true']")) return;
        onRetry?.();
      }}
      dangerouslySetInnerHTML={{
        __html: INVITATION_LOADER_PRESENTATION_HTML,
      }}
    />
  );
}
