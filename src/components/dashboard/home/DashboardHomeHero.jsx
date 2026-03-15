import { useEffect, useState } from "react";
import { ArrowDownRight, Sparkles } from "lucide-react";
import DashboardHeroCelebrationVisual from "@/components/dashboard/home/DashboardHeroCelebrationVisual";

const HERO_ROTATING_PHRASES = [
  "El evento empieza aqu\u00ED.",
  "Todo gran evento empieza con una invitaci\u00F3n.",
  "Dise\u00F1a el inicio de algo especial.",
  "Empieza a crear tu evento.",
  "Cada evento tiene un comienzo.",
  "Hoy empieza tu evento.",
];

export default function DashboardHomeHero({
  onCreateInvitation,
}) {
  const [heroPhrase, setHeroPhrase] = useState(HERO_ROTATING_PHRASES[0]);
  const [isHeroPhraseVisible, setIsHeroPhraseVisible] = useState(false);

  useEffect(() => {
    const randomPhrase =
      HERO_ROTATING_PHRASES[
        Math.floor(Math.random() * HERO_ROTATING_PHRASES.length)
      ] || HERO_ROTATING_PHRASES[0];

    setHeroPhrase(randomPhrase);
    setIsHeroPhraseVisible(true);
  }, []);

  return (
    <section className="dashboard-invitation-card group relative overflow-hidden rounded-[30px] border border-white/75 bg-[linear-gradient(135deg,_rgba(245,238,255,0.98)_0%,_rgba(252,249,255,0.97)_34%,_rgba(243,247,255,0.98)_100%)] shadow-[0_18px_44px_rgba(111,59,192,0.1)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_18%,_rgba(232,212,255,0.96),_rgba(255,255,255,0)_34%),radial-gradient(circle_at_34%_72%,_rgba(244,228,255,0.72),_rgba(255,255,255,0)_30%),radial-gradient(circle_at_82%_24%,_rgba(255,237,228,0.8),_rgba(255,255,255,0)_24%),radial-gradient(circle_at_86%_82%,_rgba(218,233,255,0.84),_rgba(255,255,255,0)_32%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(118deg,_rgba(255,255,255,0.16)_0%,_rgba(255,255,255,0.04)_28%,_rgba(255,255,255,0.18)_52%,_rgba(255,255,255,0.06)_100%)]" />
      <div className="absolute inset-y-0 left-0 w-[56%] bg-[radial-gradient(circle_at_22%_50%,_rgba(240,226,255,0.6),_rgba(255,255,255,0)_64%)]" />
      <div className="absolute inset-y-0 right-0 w-[58%] bg-[radial-gradient(circle_at_72%_48%,_rgba(225,238,255,0.54),_rgba(255,255,255,0)_62%)]" />
      <div className="absolute left-[12%] top-12 h-1.5 w-1.5 rounded-full bg-white/90 shadow-[0_0_16px_rgba(255,255,255,0.95)]" />
      <div className="absolute left-[24%] top-20 h-1 w-1 rounded-full bg-[#eacfff]/90 shadow-[0_0_14px_rgba(234,207,255,0.95)]" />
      <div className="absolute right-[26%] top-16 h-1.5 w-1.5 rounded-full bg-[#fff4e7]/95 shadow-[0_0_14px_rgba(255,244,231,0.95)]" />
      <div className="absolute right-[16%] top-24 h-1.5 w-1.5 rounded-full bg-white/90 shadow-[0_0_16px_rgba(255,255,255,0.95)]" />

      <div className="relative mx-auto grid max-w-[860px] gap-2.5 px-4 py-3 sm:gap-4 sm:px-5 sm:py-5 lg:grid-cols-[minmax(0,388px)_minmax(280px,360px)] lg:items-center lg:gap-6 lg:px-6 lg:py-5 xl:max-w-[890px] xl:grid-cols-[minmax(0,404px)_minmax(300px,372px)]">
        <div className="flex w-full max-w-[390px] flex-col items-center justify-center text-center lg:max-w-[410px]">
          <div className="flex w-full max-w-sm justify-center">
            <div className="inline-flex w-fit max-w-full items-center gap-1 rounded-full border border-white/88 bg-white/86 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.13em] text-[#6f3bc0] shadow-sm backdrop-blur transition-colors duration-300 group-hover:border-white group-hover:bg-white sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-[10px] sm:tracking-[0.15em]">
              <Sparkles className="h-3 w-3" />
              Crear tu invitacion
            </div>
          </div>

          <div className="mt-1.5 flex w-full max-w-sm flex-col items-center gap-1.5 sm:mt-2.5 sm:gap-3">
            <h1
              className={
                "min-h-[3.35rem] w-full text-[1.6rem] font-semibold tracking-tight text-slate-900 transition-all duration-500 ease-out leading-[0.98] sm:min-h-[4.8rem] sm:text-[2.35rem] sm:leading-[1.01] " +
                (isHeroPhraseVisible
                  ? "translate-y-0 opacity-100"
                  : "translate-y-1 opacity-0")
              }
            >
              {heroPhrase}
            </h1>

            <p className="w-full text-[13px] leading-[1.32rem] text-slate-700 sm:text-[15px] sm:leading-[1.55rem]">
              Dise&ntilde;a la invitaci&oacute;n y comparte el inicio de algo especial.
            </p>

            <div className="flex w-full flex-col items-center justify-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={onCreateInvitation}
                className="inline-flex items-center gap-2 rounded-[16px] border border-[#7e4dc6]/35 bg-gradient-to-r from-[#8a57cf] via-[#773dbe] to-[#6433b0] px-3.5 py-2.25 text-sm font-semibold text-white shadow-[0_12px_20px_rgba(119,61,190,0.22)] transition hover:-translate-y-[1px] hover:shadow-[0_18px_28px_rgba(119,61,190,0.3)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d8c3f5] sm:rounded-[18px] sm:px-4 sm:py-2.5 sm:shadow-[0_14px_24px_rgba(119,61,190,0.24)]"
              >
                Crear invitaci&oacute;n
                <ArrowDownRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <DashboardHeroCelebrationVisual />
      </div>
    </section>
  );
}
