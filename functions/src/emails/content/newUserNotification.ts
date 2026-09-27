import { emailBrand } from "../theme";

export const newUserNotificationContent = {
  subject: "Nuevo usuario registrado — Reserva el Día",
  preheader: "Se creó una nueva cuenta en Reserva el Día.",
  title: "Nuevo usuario registrado",
  description: "Se creó una nueva cuenta en Reserva el Día.",
  unavailable: "No disponible",
  methods: { password: "Email", "google.com": "Google", unavailable: "No disponible" },
  // Verified Next.js route: src/pages/admin/usuarios.jsx, requires superadmin.
  adminUrl: `${emailBrand.siteUrl}/admin/usuarios`,
  action: "Ver usuarios",
  note: "Notificación interna de Reserva el Día.",
} as const;
