import React from "react";

const inputClass =
  "mt-2 block h-[38px] w-[361px] max-w-full box-border bg-white px-3 font-['Source_Sans_Pro',sans-serif] text-[13px] font-normal leading-[18px] text-[#262626] outline-none placeholder:text-[#9b9b9b] [border:1px_solid_var(--Border,#00000029)] focus:[border-color:#692B9A]";
const labelClass =
  "block w-full text-left font-['Source_Sans_Pro',sans-serif] text-[16px] font-semibold leading-[24px] tracking-[0px] text-[#262626]";
const subLabelClass =
  "font-['Source_Sans_Pro',sans-serif] text-[13px] font-normal leading-[18px] text-[#262626]";
const sectionClass = "w-[361px] max-w-full px-0 pb-4 text-left";
const dividerClass = "w-[361px] max-w-full border-t border-[#262626]";
const checkboxClass =
  "h-[14px] w-[14px] accent-[#692B9A]";

export default function MiniToolbarTabDetallesEvento() {
  return (
    <div className="flex flex-1 min-h-0 w-full flex-col items-center gap-0 overflow-y-auto px-0 pb-4 pr-0 text-left">
      <section className={`${sectionClass} pt-4`}>
        <label className={labelClass} htmlFor="event-name">
          Nombre del evento
        </label>
        <input
          id="event-name"
          type="text"
          placeholder="Ej: Nuestra boda"
          className={inputClass}
        />
      </section>

      <div className={dividerClass} />

      <section className={`${sectionClass} pt-4`}>
        <h3 className={labelClass}>Nombre de los casados</h3>

        <div className="mt-3">
          <label className={subLabelClass} htmlFor="first-person-name">
            Nombre de la primera persona
          </label>
          <input
            id="first-person-name"
            type="text"
            placeholder="Ej: Sofia"
            className={inputClass}
          />
        </div>

        <div className="mt-3">
          <label className={subLabelClass} htmlFor="second-person-name">
            Nombre de la segunda persona
          </label>
          <input
            id="second-person-name"
            type="text"
            placeholder="Ej: Mateo"
            className={inputClass}
          />
        </div>
      </section>

      <div className={dividerClass} />

      <section className={`${sectionClass} pt-4`}>
        <h3 className={labelClass}>Dia y hora de evento</h3>

        <div className="mt-3">
          <label className={subLabelClass} htmlFor="event-date">
            Fecha
          </label>
          <input
            id="event-date"
            type="text"
            defaultValue="13 / 12 /2026"
            className={inputClass}
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className={subLabelClass} htmlFor="event-start-time">
              Hora de inicio
            </label>
            <input
              id="event-start-time"
              type="text"
              defaultValue="18:00 hs"
              className={inputClass}
            />
          </div>

          <div>
            <label className={subLabelClass} htmlFor="event-end-time">
              Hora Fin <span className="text-[#777777]">(opcional)</span>
            </label>
            <input
              id="event-end-time"
              type="text"
              placeholder="Opcional"
              className={inputClass}
            />
          </div>
        </div>

        <label className="mt-4 flex items-center gap-2 font-['Source_Sans_Pro',sans-serif] text-[13px] font-normal leading-[18px] text-[#262626]">
          <input
            type="checkbox"
            defaultChecked
            className={checkboxClass}
          />
          Mostrar contador con cuenta regresiva
        </label>
      </section>

      <div className={dividerClass} />

      <section className="w-full pb-1 pt-4 text-left">
        <h3 className={labelClass}>Ubicacion del evento</h3>

        <div className="mt-3">
          <label className={subLabelClass} htmlFor="event-place">
            Nombre del lugar <span className="text-[#777777]">(opcional)</span>
          </label>
          <input
            id="event-place"
            type="text"
            placeholder="Ej: Salon Las Acacias"
            className={inputClass}
          />
        </div>

        <div className="mt-3">
          <label className={subLabelClass} htmlFor="event-address">
            Direccion
          </label>
          <input
            id="event-address"
            type="text"
            placeholder="Ej: Av. Corrientes 1234, CABA"
            className={inputClass}
          />
        </div>

        <label className="mt-4 flex items-center gap-2 font-['Source_Sans_Pro',sans-serif] text-[13px] font-normal leading-[18px] text-[#262626]">
          <input
            type="checkbox"
            defaultChecked
            className={checkboxClass}
          />
          Mostrar mapa en la invitacion
        </label>
      </section>
    </div>
  );
}
