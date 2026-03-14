export default function DashboardHeroCelebrationVisual() {
  return (
    <div className="relative mx-auto h-full min-h-[180px] w-full max-w-[310px] sm:min-h-[205px] sm:max-w-[338px] lg:max-w-[364px] lg:min-h-[236px]">
      <div className="absolute inset-x-[14%] top-[10%] h-24 rounded-full bg-[#f3ddff]/74 blur-3xl" />
      <div className="absolute right-[4%] top-[18%] h-24 w-24 rounded-full bg-[#ffe8da]/56 blur-3xl" />
      <div className="absolute bottom-[12%] left-[2%] h-20 w-20 rounded-full bg-[#d7ecff]/74 blur-3xl" />
      <div className="absolute left-[8%] top-[8%] h-20 w-20 rounded-full bg-white/50 blur-3xl" />
      <div className="absolute right-[8%] bottom-[8%] h-24 w-24 rounded-full bg-white/35 blur-3xl" />
      <div className="absolute inset-x-[18%] top-[18%] h-px bg-white/55" />
      <div className="absolute left-[17%] top-[19%] h-2.5 w-2.5 rounded-full bg-white/95 shadow-[0_0_18px_rgba(255,255,255,0.95)] motion-safe:animate-pulse motion-safe:[animation-duration:8s]" />
      <div className="absolute right-[16%] top-[22%] h-2 w-2 rounded-full bg-[#f4ddff] shadow-[0_0_18px_rgba(244,221,255,0.95)] motion-safe:animate-pulse motion-safe:[animation-duration:10s]" />
      <div className="absolute right-[22%] bottom-[19%] h-2 w-2 rounded-full bg-[#e0eeff] shadow-[0_0_18px_rgba(224,238,255,0.95)] motion-safe:animate-pulse motion-safe:[animation-duration:9s]" />
      <div className="absolute left-[18%] bottom-[16%] h-1.5 w-1.5 rounded-full bg-white/90 shadow-[0_0_16px_rgba(255,255,255,0.9)] motion-safe:animate-pulse motion-safe:[animation-duration:11s]" />

      <div className="hero-wave-drift absolute inset-0">
        <svg
          viewBox="0 0 360 260"
          className="absolute inset-0 h-full w-full opacity-90"
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

      <div className="absolute inset-x-[14%] bottom-[8%] h-24 rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.72),_rgba(255,255,255,0)_64%)] opacity-75" />
      <div className="absolute inset-x-[20%] bottom-[14%] h-px bg-white/40" />
      <div className="absolute bottom-[9%] left-[16%] right-[14%] h-[66px] rounded-full bg-[linear-gradient(180deg,_rgba(255,255,255,0.14),_rgba(255,255,255,0.02))] blur-[1px]" />

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
