const {
  INVITATION_LOADER_PRESENTATION_HTML,
} = require("../../../shared/invitationLoaderPresentation.cjs");

export default function PreviewLoadingPresentation({
  announce = true,
  className = "",
}) {
  return (
    <div
      className={`absolute inset-0 z-10 overflow-hidden ${className}`}
      style={{ contain: "layout paint" }}
      data-preview-loading-authority="frame"
      aria-hidden={announce ? undefined : "true"}
      dangerouslySetInnerHTML={{
        __html: INVITATION_LOADER_PRESENTATION_HTML,
      }}
    />
  );
}
