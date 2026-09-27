import { Heading, Text } from "react-email";
import { EmailLayout } from "../components/EmailLayout";
import { EmailButton } from "../components/EmailButton";
import { newUserNotificationContent as content } from "../content/newUserNotification";
import type { NewUserNotificationEmailData } from "../types";

export function NewUserNotificationEmail({ name, email, registrationMethod, createdAt }: NewUserNotificationEmailData) {
  const date = createdAt ? new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires", dateStyle: "long", timeStyle: "short",
  }).format(new Date(createdAt)) + " (Buenos Aires, UTC−03:00)" : content.unavailable;
  return (
    <EmailLayout preview={content.preheader}>
      <Heading as="h1" style={{ fontSize: 24, lineHeight: "32px", margin: "0 0 16px" }}>{content.title}</Heading>
      <Text>{content.description}</Text>
      <Text><strong>Nombre:</strong> {name || content.unavailable}</Text>
      <Text><strong>Email:</strong> {email || content.unavailable}</Text>
      <Text><strong>Método de registro:</strong> {content.methods[registrationMethod]}</Text>
      <Text style={{ marginBottom: 24 }}><strong>Fecha/hora de creación:</strong> {date}</Text>
      <EmailButton href={content.adminUrl}>{content.action}</EmailButton>
      <Text style={{ fontSize: 13, marginTop: 24 }}>{content.note}</Text>
    </EmailLayout>
  );
}

NewUserNotificationEmail.PreviewProps = {
  name: "Agustín Prueba", email: "usuario@example.invalid",
  registrationMethod: "google.com", createdAt: "2026-09-27T15:30:00.000Z",
} satisfies NewUserNotificationEmailData;

export default NewUserNotificationEmail;
