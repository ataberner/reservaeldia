import { useEffect, useMemo, useState } from "react";
import { Image as ImageIcon } from "lucide-react";

function toNonEmptyString(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function buildCandidateList(primarySrc, previewCandidates = []) {
  const candidates = [];

  [primarySrc, ...(Array.isArray(previewCandidates) ? previewCandidates : [])].forEach(
    (value) => {
      const candidate = toNonEmptyString(value);
      if (!candidate) return;
      if (candidates.includes(candidate)) return;
      candidates.push(candidate);
    }
  );

  return candidates;
}

export default function ResolvedPreviewImage({
  primarySrc = "",
  previewCandidates = [],
  alt = "Preview",
  className = "",
  loading = "lazy",
  fallbackClassName = "flex h-full w-full items-center justify-center text-gray-400",
  fallbackIconClassName = "h-7 w-7",
}) {
  const candidates = useMemo(
    () => buildCandidateList(primarySrc, previewCandidates),
    [primarySrc, previewCandidates]
  );
  const candidateKey = candidates.join("||");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [failedAll, setFailedAll] = useState(candidates.length === 0);

  useEffect(() => {
    setCurrentIndex(0);
    setFailedAll(candidates.length === 0);
  }, [candidateKey, candidates.length]);

  if (failedAll || !candidates[currentIndex]) {
    return (
      <div className={fallbackClassName}>
        <ImageIcon className={fallbackIconClassName} />
      </div>
    );
  }

  return (
    <img
      src={candidates[currentIndex]}
      alt={alt}
      className={className}
      loading={loading}
      data-preview-index={currentIndex}
      onError={() => {
        setCurrentIndex((previous) => {
          const nextIndex = previous + 1;
          if (nextIndex >= candidates.length) {
            setFailedAll(true);
            return previous;
          }
          return nextIndex;
        });
      }}
    />
  );
}
