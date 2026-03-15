export default function DashboardHeroCelebrationVisual() {
  return (
    <div className="relative mx-auto h-full min-h-[96px] w-full max-w-[216px] sm:min-h-[205px] sm:max-w-[338px] lg:max-w-[364px] lg:min-h-[236px]">
      <div className="absolute inset-x-[18%] top-[14%] h-16 rounded-full bg-[#f3ddff]/64 blur-3xl sm:inset-x-[14%] sm:top-[10%] sm:h-24 sm:bg-[#f3ddff]/82" />
      <div className="absolute right-[8%] top-[22%] h-16 w-16 rounded-full bg-[#ffe8da]/52 blur-3xl sm:right-[4%] sm:top-[18%] sm:h-24 sm:w-24 sm:bg-[#ffe8da]/64" />
      <div className="absolute bottom-[16%] left-[6%] h-14 w-14 rounded-full bg-[#d7ecff]/62 blur-3xl sm:bottom-[12%] sm:left-[2%] sm:h-20 sm:w-20 sm:bg-[#d7ecff]/82" />
      <div className="absolute left-[10%] top-[12%] hidden h-14 w-14 rounded-full bg-white/32 blur-3xl sm:block sm:h-20 sm:w-20 sm:bg-white/58" />
      <div className="absolute right-[10%] bottom-[10%] hidden h-16 w-16 rounded-full bg-white/24 blur-3xl sm:block sm:h-24 sm:w-24 sm:bg-white/42" />
      <div className="absolute inset-x-[22%] top-[26%] h-px bg-white/42 sm:inset-x-[18%] sm:top-[18%] sm:bg-white/68" />
      <div className="absolute left-[17%] top-[25%] h-1.5 w-1.5 rounded-full bg-white/88 shadow-[0_0_14px_rgba(255,255,255,0.78)] motion-safe:animate-pulse motion-safe:[animation-duration:8s] sm:h-2.5 sm:w-2.5 sm:bg-white/95 sm:shadow-[0_0_18px_rgba(255,255,255,0.95)]" />
      <div className="absolute right-[16%] top-[28%] h-1.5 w-1.5 rounded-full bg-[#f4ddff]/82 shadow-[0_0_14px_rgba(244,221,255,0.8)] motion-safe:animate-pulse motion-safe:[animation-duration:10s] sm:h-2 sm:w-2 sm:bg-[#f4ddff] sm:shadow-[0_0_18px_rgba(244,221,255,0.95)]" />
      <div className="absolute right-[22%] bottom-[25%] h-1.5 w-1.5 rounded-full bg-[#e0eeff]/82 shadow-[0_0_14px_rgba(224,238,255,0.8)] motion-safe:animate-pulse motion-safe:[animation-duration:9s] sm:h-2 sm:w-2 sm:bg-[#e0eeff] sm:shadow-[0_0_18px_rgba(224,238,255,0.95)]" />
      <div className="absolute left-[18%] bottom-[21%] h-1 w-1 rounded-full bg-white/78 shadow-[0_0_10px_rgba(255,255,255,0.72)] motion-safe:animate-pulse motion-safe:[animation-duration:11s] sm:h-1.5 sm:w-1.5 sm:bg-white/90 sm:shadow-[0_0_16px_rgba(255,255,255,0.9)]" />

      <div className="hero-wave-drift absolute inset-0">
        <svg
          viewBox="0 0 360 260"
          className="absolute inset-0 h-full w-full opacity-[0.82] sm:opacity-[0.98]"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="hero-line-a" x1="0%" x2="100%" y1="0%" y2="0%">
              <stop offset="0%" stopColor="rgba(177,127,233,0.16)" />
              <stop offset="50%" stopColor="rgba(255,255,255,0.78)" />
              <stop offset="100%" stopColor="rgba(132,191,255,0.3)" />
            </linearGradient>
            <linearGradient id="hero-line-b" x1="0%" x2="100%" y1="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.15)" />
              <stop offset="50%" stopColor="rgba(221,199,255,0.74)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0.12)" />
            </linearGradient>
            <linearGradient id="hero-line-c" x1="0%" x2="100%" y1="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(208,233,255,0.12)" />
              <stop offset="40%" stopColor="rgba(255,255,255,0.78)" />
              <stop offset="100%" stopColor="rgba(255,219,235,0.22)" />
            </linearGradient>
            <radialGradient id="hero-node" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(255,255,255,1)" />
              <stop offset="45%" stopColor="rgba(255,255,255,0.92)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </radialGradient>
          </defs>

          <path
            d="M30 70 C90 18, 170 26, 220 82 S312 142, 332 98"
            fill="none"
            stroke="url(#hero-line-a)"
            strokeWidth="1.9"
            strokeLinecap="round"
          />
          <path
            d="M42 198 C98 152, 174 144, 238 178 S302 214, 332 194"
            fill="none"
            stroke="url(#hero-line-b)"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <path
            d="M66 110 C120 92, 150 80, 184 102 C226 130, 252 120, 292 88"
            fill="none"
            stroke="url(#hero-line-c)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M60 220 C104 206, 142 208, 184 226 C232 248, 286 246, 324 214"
            fill="none"
            stroke="rgba(255,255,255,0.24)"
            strokeWidth="1.1"
            strokeLinecap="round"
          />

          <circle cx="58" cy="64" r="10" fill="url(#hero-node)" />
          <circle cx="150" cy="42" r="12" fill="url(#hero-node)" />
          <circle cx="230" cy="88" r="11" fill="url(#hero-node)" />
          <circle cx="312" cy="108" r="12" fill="url(#hero-node)" />
          <circle cx="100" cy="166" r="10" fill="url(#hero-node)" />
          <circle cx="214" cy="178" r="13" fill="url(#hero-node)" />
          <circle cx="292" cy="198" r="10" fill="url(#hero-node)" />

          <circle cx="58" cy="64" r="2.8" fill="rgba(255,255,255,0.98)" />
          <circle cx="150" cy="42" r="3.2" fill="rgba(255,255,255,0.98)" />
          <circle cx="230" cy="88" r="3" fill="rgba(255,255,255,0.98)" />
          <circle cx="312" cy="108" r="3.2" fill="rgba(255,255,255,0.98)" />
          <circle cx="100" cy="166" r="2.6" fill="rgba(255,255,255,0.96)" />
          <circle cx="214" cy="178" r="3.2" fill="rgba(255,255,255,0.98)" />
          <circle cx="292" cy="198" r="2.8" fill="rgba(255,255,255,0.96)" />
        </svg>
      </div>

      <div className="absolute inset-x-[20%] bottom-[10%] h-12 rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.6),_rgba(255,255,255,0)_64%)] opacity-80 sm:inset-x-[14%] sm:bottom-[8%] sm:h-24 sm:bg-[radial-gradient(circle,_rgba(255,255,255,0.78),_rgba(255,255,255,0)_64%)] sm:opacity-85" />
      <div className="absolute inset-x-[24%] bottom-[16%] h-px bg-white/36 sm:inset-x-[20%] sm:bottom-[14%] sm:bg-white/52" />
      <div className="absolute bottom-[10%] left-[20%] right-[18%] h-[32px] rounded-full bg-[linear-gradient(180deg,_rgba(255,255,255,0.14),_rgba(255,255,255,0.03))] blur-[1px] sm:bottom-[9%] sm:left-[16%] sm:right-[14%] sm:h-[66px] sm:bg-[linear-gradient(180deg,_rgba(255,255,255,0.18),_rgba(255,255,255,0.03))]" />

      <style jsx>{`
        .hero-wave-drift {
          will-change: transform;
        }

        @media (prefers-reduced-motion: no-preference) {
          .hero-wave-drift {
            animation: hero-wave-drift 35s ease-in-out infinite;
          }
        }

        @keyframes hero-wave-drift {
          0% {
            transform: translate3d(0, 0, 0);
          }
          50% {
            transform: translate3d(20px, -10px, 0);
          }
          100% {
            transform: translate3d(0, 0, 0);
          }
        }
      `}</style>
    </div>
  );
}
