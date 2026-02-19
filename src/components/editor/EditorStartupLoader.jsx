import { useEffect, useMemo, useRef, useState } from "react";

const WEDDING_SCENES = [
  "Encendemos pequenas luces para que su historia tenga brillo desde el primer segundo.",
  "Acomodamos flores, sobres y suspiros en una mesa llena de ilusion.",
  "Pulimos cada palabra como quien ensaya un \"si, quiero\" inolvidable.",
  "Afinamos los tonos del atardecer para abrazar su fecha especial.",
  "Tejemos risas, abrazos y brindis en una misma melodia visual.",
  "Doblamos cada detalle con calma, como una carta escrita con amor.",
  "Guardamos un espacio para esa mirada que lo dice todo sin hablar.",
  "Atamos cintas invisibles entre sus nombres para que todo se sienta unico.",
  "Preparamos una lluvia de estrellas para la gran entrada de su invitacion.",
  "Damos la ultima puntada para que al abrirla se sienta emocion de verdad.",
];

function toProgress(total, processed) {
  if (!total) return 100;
  const ratio = Math.max(0, Math.min(1, processed / total));
  return Math.round(ratio * 100);
}

export default function EditorStartupLoader({ preloadState = {}, runtimeState = {} }) {
  const [lineIndex, setLineIndex] = useState(0);
  const [lineVisible, setLineVisible] = useState(true);
  const [displayProgress, setDisplayProgress] = useState(12);
  const [maxSignalProgress, setMaxSignalProgress] = useState(12);
  const progressStartAtRef = useRef(Date.now());

  useEffect(() => {
    if (WEDDING_SCENES.length <= 1) return undefined;

    let fadeTimer = 0;
    const rotateTimer = window.setInterval(() => {
      setLineVisible(false);
      fadeTimer = window.setTimeout(() => {
        setLineIndex((prev) => (prev + 1) % WEDDING_SCENES.length);
        setLineVisible(true);
      }, 340);
    }, 4600);

    return () => {
      if (fadeTimer) window.clearTimeout(fadeTimer);
      window.clearInterval(rotateTimer);
    };
  }, []);

  const fontsProcessed = (preloadState.fontsLoaded || 0) + (preloadState.fontsFailed || 0);
  const imagesProcessed = (preloadState.imagesLoaded || 0) + (preloadState.imagesFailed || 0);
  const backgroundsProcessed = (runtimeState.loadedBackgrounds || 0) + (runtimeState.failedBackgrounds || 0);
  const fontsTotal = Number(preloadState.fontsTotal || 0);
  const imagesTotal = Number(preloadState.imagesTotal || 0);
  const backgroundsTotal = Number(runtimeState.totalBackgrounds || 0);
  const isReady = preloadState.status === "done" && runtimeState.status === "ready";
  const expectedDurationMs = useMemo(() => {
    const estimate =
      12000 +
      fontsTotal * 280 +
      imagesTotal * 190 +
      backgroundsTotal * 260;
    return Math.max(12000, Math.min(42000, estimate));
  }, [backgroundsTotal, fontsTotal, imagesTotal]);

  const signalProgress = useMemo(() => {
    const buckets = [];

    if (fontsTotal > 0) {
      buckets.push(toProgress(fontsTotal, fontsProcessed));
    }
    if (imagesTotal > 0) {
      buckets.push(toProgress(imagesTotal, imagesProcessed));
    }
    if (backgroundsTotal > 0) {
      buckets.push(toProgress(backgroundsTotal, backgroundsProcessed));
    }

    if (buckets.length > 0) {
      const average = buckets.reduce((acc, value) => acc + value, 0) / buckets.length;
      return Math.max(5, Math.min(100, Math.round(average)));
    }

    if (preloadState.status === "done" && runtimeState.status === "ready") return 100;
    if (preloadState.status === "done") return 88;
    if (preloadState.status === "running") return 42;
    return 18;
  }, [
    backgroundsProcessed,
    backgroundsTotal,
    fontsProcessed,
    fontsTotal,
    imagesProcessed,
    imagesTotal,
    preloadState.status,
    runtimeState.status,
  ]);

  useEffect(() => {
    progressStartAtRef.current = Date.now();
    setDisplayProgress(12);
    setMaxSignalProgress(12);
  }, [preloadState.slug]);

  useEffect(() => {
    setMaxSignalProgress((prev) => Math.max(prev, signalProgress));
  }, [signalProgress]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setDisplayProgress((prev) => {
        if (isReady) {
          if (prev >= 100) return 100;
          const remaining = 100 - prev;
          const step = prev < 97
            ? Math.max(0.9, remaining * 0.34)
            : Math.max(0.7, remaining * 0.52);
          return Math.min(100, prev + step);
        }

        const elapsedMs = Date.now() - progressStartAtRef.current;
        const ratio = Math.max(0, Math.min(1, elapsedMs / expectedDurationMs));
        const easedRatio = Math.pow(ratio, 2.35);
        const pacedProgress = 10 + easedRatio * 80; // 10 -> 90 (inicio mas lento)

        const overtimeMs = Math.max(0, elapsedMs - expectedDurationMs);
        const overtimeBoost = (1 - Math.exp(-overtimeMs / 7000)) * 9.9; // hasta ~99.9

        const signalWeight = 0.08 + ratio * 0.22; // evita saltos bruscos por señal real
        const weightedSignal =
          10 + Math.max(0, maxSignalProgress - 10) * signalWeight;

        const target = Math.min(
          99.9,
          Math.max(pacedProgress + overtimeBoost, weightedSignal)
        );

        if (target <= prev) {
          if (prev < 99.9) {
            const drift = ratio < 0.65 ? 0.03 : ratio < 0.9 ? 0.05 : 0.08;
            return Math.min(99.9, prev + drift);
          }
          return prev;
        }

        const gap = target - prev;
        const maxStep =
          ratio < 0.3 ? 0.16 : ratio < 0.7 ? 0.3 : 0.58;
        const step = Math.min(
          maxStep,
          Math.max(0.05, gap * (ratio < 0.65 ? 0.12 : 0.22))
        );
        return Math.min(target, prev + step);
      });
    }, 120);

    return () => window.clearInterval(timer);
  }, [expectedDurationMs, isReady, maxSignalProgress]);

  const displayProgressValue = Math.min(100, Math.max(0, displayProgress));
  const displayProgressInteger = isReady
    ? Math.min(100, Math.round(displayProgressValue))
    : Math.min(99, Math.floor(displayProgressValue));
  const displayProgressLabel = `${displayProgressInteger}%`;

  return (
    <div className="w-full px-4 py-10 sm:px-6 lg:px-8">
      <div className="relative mx-auto w-full max-w-4xl overflow-hidden rounded-[28px] border border-[#e4d7fb] bg-gradient-to-br from-white via-[#f9f4ff] to-[#eff4ff] p-6 shadow-[0_24px_60px_-35px_rgba(68,39,122,0.45)] sm:p-8">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[#a978e8]/24 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-14 -left-10 h-44 w-44 rounded-full bg-[#8ea9ff]/22 blur-2xl" />
        <div className="pointer-events-none absolute right-10 top-10 h-2.5 w-2.5 animate-pulse rounded-full bg-[#7a44ce]/70" />
        <div className="pointer-events-none absolute bottom-12 left-16 h-2 w-2 animate-pulse rounded-full bg-[#4f82d9]/65" />

        <div className="relative">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#7a44ce]">
            Reserva el Dia
          </p>
          <h3 className="mt-2 text-3xl leading-tight text-[#3c2d61] [font-family:'Cormorant_Garamond','Times_New_Roman',serif] sm:text-4xl">
            Estamos preparando tu invitacion
          </h3>
          <p className="mt-3 mx-auto max-w-3xl text-center text-sm text-[#5f5682] sm:text-base">
            Ajustamos el ambiente para que cuando se abra, se sienta exactamente como ustedes.
          </p>
        </div>

        <div className="relative mt-7 rounded-2xl border border-white/80 bg-white/70 p-4 backdrop-blur-sm sm:p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7a44ce]">
            Mientras afinamos cada detalle
          </p>
          <p
            className={`mt-3 min-h-[82px] text-lg leading-relaxed text-[#403562] transition-opacity duration-500 [font-family:'Cormorant_Garamond','Times_New_Roman',serif] sm:min-h-[70px] sm:text-2xl ${lineVisible ? "opacity-100" : "opacity-0"}`}
          >
            {WEDDING_SCENES[lineIndex]}
          </p>
        </div>

        <div className="mt-7">
          <div className="mb-2 flex items-center justify-between text-xs font-medium uppercase tracking-[0.14em] text-[#6e5aa8]">
            <span>Avance general</span>
            <span>{displayProgressLabel}</span>
          </div>
          <div className="relative h-3 overflow-hidden rounded-full bg-[#e9ddfb]">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#6f3bc0] via-[#773dbe] to-[#4f82d9] transition-all duration-200 ease-linear"
              style={{ width: `${displayProgressValue}%` }}
            />
            <div className="absolute inset-0 animate-pulse bg-[linear-gradient(110deg,transparent_20%,rgba(255,255,255,0.35)_45%,transparent_70%)]" />
          </div>
        </div>
      </div>
    </div>
  );
}
