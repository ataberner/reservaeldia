import { ArrowDownRight, Sparkles } from "lucide-react";

export default function DashboardHomeHero({
  onCreateInvitation,
}) {
  return (
    <section className="overflow-hidden rounded-[34px] border border-[#eadffd] bg-[radial-gradient(circle_at_top_left,_rgba(244,231,255,0.96),_rgba(255,255,255,0.96)_44%,_rgba(241,247,255,0.96)_100%)] shadow-[0_24px_70px_rgba(111,59,192,0.12)]">
      <div className="relative px-5 py-7 sm:px-8 sm:py-9 lg:px-10 lg:py-10">
        <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-[#eadbff]/55 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-28 w-28 rounded-full bg-[#dcefff]/70 blur-3xl" />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#dcc8fb] bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6f3bc0] shadow-sm">
              <Sparkles className="h-3.5 w-3.5" />
              Crear tu invitacion
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 sm:text-[2.45rem]">
              Tu invitaci&oacute;n, dise&ntilde;ada a tu estilo.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
              Crea y publica tu invitaci&oacute;n digital en minutos.
              <br />
              Elige uno de nuestros dise&ntilde;os o crea el tuyo desde cero.
              <br />
              Lista para compartir.
            </p>
          </div>

          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={onCreateInvitation}
              className="inline-flex items-center gap-2 rounded-2xl border border-[#7e4dc6]/35 bg-gradient-to-r from-[#8a57cf] via-[#773dbe] to-[#6433b0] px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_30px_rgba(119,61,190,0.28)] transition hover:-translate-y-[1px] hover:shadow-[0_20px_36px_rgba(119,61,190,0.34)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d8c3f5]"
            >
              Crear invitacion
              <ArrowDownRight className="h-4 w-4" />
            </button>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
              Colecciones editoriales
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
