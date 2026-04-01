import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ShieldAlert,
} from "lucide-react";

function NoticeIcon({ severity }) {
  if (severity === "error") {
    return <ShieldAlert className="h-3.5 w-3.5" />;
  }

  if (severity === "warning") {
    return <AlertTriangle className="h-3.5 w-3.5" />;
  }

  if (severity === "success") {
    return <CheckCircle2 className="h-3.5 w-3.5" />;
  }

  return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
}

function getNoticeStyles(severity) {
  if (severity === "error") {
    return {
      card: "border-[#f0ccd6]/90 bg-[linear-gradient(135deg,rgba(255,250,252,0.94),rgba(255,255,255,0.86))] text-[#8a3450] shadow-[0_14px_30px_rgba(138,52,80,0.12)]",
      icon: "border-[#f5d7df] bg-white/90 text-[#a4385b]",
      badge: "border-[#f3d4dc] bg-white/88 text-[#8a3450]",
    };
  }

  if (severity === "warning") {
    return {
      card: "border-[#f0dfbf]/90 bg-[linear-gradient(135deg,rgba(255,252,245,0.94),rgba(255,255,255,0.86))] text-[#8a6230] shadow-[0_14px_30px_rgba(138,98,48,0.11)]",
      icon: "border-[#f4e5c8] bg-white/90 text-[#9b6a28]",
      badge: "border-[#f3e2c2] bg-white/88 text-[#8a6230]",
    };
  }

  if (severity === "success") {
    return {
      card: "border-[#cfe8db]/90 bg-[linear-gradient(135deg,rgba(246,255,250,0.94),rgba(255,255,255,0.86))] text-[#2d7a59] shadow-[0_14px_30px_rgba(45,122,89,0.11)]",
      icon: "border-[#d8eee2] bg-white/90 text-[#2f8a63]",
      badge: "border-[#d5ebdf] bg-white/88 text-[#2d7a59]",
    };
  }

  return {
    card: "border-[#e6e3ee]/90 bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(248,248,252,0.88))] text-slate-600 shadow-[0_14px_30px_rgba(15,23,42,0.08)]",
    icon: "border-[#ece8f4] bg-white/90 text-slate-500",
    badge: "border-[#ece8f4] bg-white/88 text-slate-500",
  };
}

function NoticeCard({ notice }) {
  const styles = getNoticeStyles(notice?.severity);

  return (
    <div
      className={`rounded-[18px] border px-3 py-2.5 backdrop-blur-[14px] ${styles.card}`}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${styles.icon}`}
        >
          <NoticeIcon severity={notice?.severity} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-medium leading-5">
            {notice?.text}
          </p>
        </div>

        {Number(notice?.count) > 1 ? (
          <span
            className={`inline-flex h-6 shrink-0 items-center rounded-full border px-2 text-[10px] font-semibold ${styles.badge}`}
          >
            x{notice.count}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default function PreviewPublishNoticeLayer({
  notices = [],
  position = null,
}) {
  if (!Array.isArray(notices) || notices.length === 0 || !position) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none absolute z-[18]"
      style={{
        top: position.top,
        right: position.right,
        width: position.width,
      }}
    >
      <div className="pointer-events-auto max-h-[min(34vh,260px)] overflow-y-auto pr-1">
        <div className="flex flex-col gap-2">
          {notices.map((notice) => (
            <NoticeCard key={notice.id} notice={notice} />
          ))}
        </div>
      </div>
    </div>
  );
}
