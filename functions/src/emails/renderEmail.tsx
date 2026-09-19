import { render, toPlainText } from "react-email";
import { isEmptyEmailData } from "./config";
import { TestEmail } from "./templates/TestEmail";
import type { RenderedEmail, TransactionalEmailRequest } from "./types";

export async function renderEmail(
  input: Pick<TransactionalEmailRequest, "template" | "data">
): Promise<RenderedEmail> {
  if (input.template !== "test" || !isEmptyEmailData(input.data)) {
    throw new Error("Invalid email template data");
  }
  const html = await render(<TestEmail />);
  return {
    subject: "Prueba sandbox — Reserva el Día",
    html,
    text: toPlainText(html),
  };
}
