import type { ComponentType } from "react";
import { welcomeContent } from "./content/welcome";
import { TestEmail } from "./templates/TestEmail";
import { WelcomeEmail } from "./templates/WelcomeEmail";
import { NewUserNotificationEmail } from "./templates/NewUserNotificationEmail";
import { newUserNotificationContent } from "./content/newUserNotification";
import { isEmailDataRecord, isEmptyEmailData, isWelcomeEmailData, isNewUserNotificationEmailData } from "./templateData";
import type { EmailTemplateData, EmailTemplateRequest } from "./types";

export type EmailTemplateDefinition<Data extends object> = {
  subject: string;
  component: ComponentType<Data>;
  isData: (value: unknown) => value is Data;
  previewData: Data;
};

export const emailTemplates = {
  test: {
    subject: "Prueba sandbox — Reserva el Día",
    component: TestEmail,
    isData: isEmptyEmailData,
    previewData: {},
  },
  welcome: {
    subject: welcomeContent.subject,
    component: WelcomeEmail,
    isData: isWelcomeEmailData,
    previewData: WelcomeEmail.PreviewProps,
  },
  newUserNotification: {
    subject: newUserNotificationContent.subject,
    component: NewUserNotificationEmail,
    isData: isNewUserNotificationEmailData,
    previewData: NewUserNotificationEmail.PreviewProps,
  },
} satisfies { [Key in keyof EmailTemplateData]: EmailTemplateDefinition<EmailTemplateData[Key]> };

export function isEmailTemplateRequest(value: unknown): value is EmailTemplateRequest {
  if (!isEmailDataRecord(value)) return false;
  switch (value.template) {
    case "test": return emailTemplates.test.isData(value.data);
    case "welcome": return emailTemplates.welcome.isData(value.data);
    case "newUserNotification": return emailTemplates.newUserNotification.isData(value.data);
    default: return false;
  }
}
