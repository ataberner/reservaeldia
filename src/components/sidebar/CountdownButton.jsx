// src/components/sidebar/CountdownButton.jsx
import { useState, useRef, useEffect } from "react";
import ModalCountdown from "./ModalCountdown";

export default function CountdownButton() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => setOpen(v => !v)}
          data-countdown-btn="open"
        className="flex items-center gap-2 w-full bg-pink-100 hover:bg-pink-200 text-pink-800 font-medium py-2 px-4 rounded-xl shadow-sm transition-all"
      >
        <span className="text-lg">⏳</span>
        <span>Añadir cuenta regresiva</span>
      </button>

      <ModalCountdown visible={open} onClose={() => setOpen(false)} />
    </div>
  );
}
