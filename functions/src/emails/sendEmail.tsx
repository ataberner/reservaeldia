import {
  SendEmailCommand,
} from "@aws-sdk/client-ses";

import {
  render,
  toPlainText,
} from "react-email";

import type { ReactElement } from "react";

import {
  createSesClient,
} from "./sesClient";

type SendEmailParams = {
  to: string;
  subject: string;
  email: ReactElement;
};

export async function sendEmail({
  to,
  subject,
  email,
}: SendEmailParams) {

  const html = await render(email);

  const text = toPlainText(html);

  const ses = createSesClient();

  const command = new SendEmailCommand({
    Source:
      "Reserva el Día <notificaciones@reservaeldia.com.ar>",

    Destination: {
      ToAddresses: [to],
    },

    Message: {
      Subject: {
        Data: subject,
        Charset: "UTF-8",
      },

      Body: {
        Html: {
          Data: html,
          Charset: "UTF-8",
        },

        Text: {
          Data: text,
          Charset: "UTF-8",
        },
      },
    },
  });

  return ses.send(command);
}