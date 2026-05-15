"use strict";

const logger = require("../utils/logger");

const buildEmailHtml = ({ resetUrl, code, minutes }) => `
  <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
    <h2>Recupera tu contraseña</h2>
    <p>Recibimos una solicitud para cambiar la contraseña de tu cuenta.</p>
    ${
      code
        ? `<p>Ingresa este código en la página de recuperación:</p>
           <p style="font-size:28px;letter-spacing:8px;font-weight:700;background:#f1f5f9;padding:14px 18px;border-radius:10px;display:inline-block">${code}</p>`
        : ""
    }
    <p>
      <a href="${resetUrl}" style="display:inline-block;padding:12px 16px;border-radius:8px;background:#0d9488;color:#ffffff;text-decoration:none;font-weight:700">
        Abrir recuperación
      </a>
    </p>
    <p>Este ${code ? "código" : "enlace"} vence en ${minutes} minutos y solo se puede usar una vez.</p>
    <p>Si no solicitaste este cambio, puedes ignorar este mensaje.</p>
  </div>
`;

const buildEmailText = ({ resetUrl, code, userName, minutes }) => {
  const lines = [
    `Hola${userName ? ` ${userName}` : ""}.`,
    "Recibimos una solicitud para cambiar la contraseña de tu cuenta.",
    code ? `Tu código de recuperación es: ${code}` : "",
    `Abre la página de recuperación antes de ${minutes} minutos: ${resetUrl}`,
    "Si no solicitaste este cambio, ignora este mensaje."
  ].filter(Boolean);
  return lines.join("\n\n");
};

const parseFromAddress = (value) => {
  const raw = String(value || "").trim();
  const match = raw.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) {
    return { name: match[1].trim(), email: match[2].trim() };
  }
  return { email: raw };
};

const sendWithResend = async ({ to, resetUrl, code, userName, minutes }) => {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PASSWORD_RESET_FROM_EMAIL;

  if (!apiKey || !from) {
    return { sent: false, reason: "resend_not_configured" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to,
      subject: "Recupera tu contraseña",
      html: buildEmailHtml({ resetUrl, code, minutes }),
      text: buildEmailText({ resetUrl, code, userName, minutes })
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend rechazo el correo (${response.status}): ${body.slice(0, 300)}`);
  }

  return { sent: true, provider: "resend" };
};

const sendWithSendGrid = async ({ to, resetUrl, code, userName, minutes }) => {
  const apiKey = process.env.SENDGRID_API_KEY;
  const from = process.env.PASSWORD_RESET_FROM_EMAIL;

  if (!apiKey || !from) {
    return { sent: false, reason: "sendgrid_not_configured" };
  }

  const fromAddress = parseFromAddress(from);
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: [{ email: to, ...(userName ? { name: userName } : {}) }]
        }
      ],
      from: fromAddress,
      subject: "Recupera tu contraseña",
      content: [
        {
          type: "text/plain",
          value: buildEmailText({ resetUrl, code, userName, minutes })
        },
        {
          type: "text/html",
          value: buildEmailHtml({ resetUrl, code, minutes })
        }
      ]
    })
  });

  if (response.status !== 202) {
    const body = await response.text();
    throw new Error(`SendGrid rechazo el correo (${response.status}): ${body.slice(0, 300)}`);
  }

  return { sent: true, provider: "sendgrid" };
};

const sendPasswordResetEmail = async ({ user, resetUrl, code, minutes }) => {
  try {
    const provider = String(process.env.PASSWORD_RESET_EMAIL_PROVIDER || "").trim().toLowerCase();
    const useSendGrid = provider === "sendgrid" || (!provider && Boolean(process.env.SENDGRID_API_KEY));
    const result = await (useSendGrid ? sendWithSendGrid : sendWithResend)({
      to: user.email,
      resetUrl,
      code,
      userName: user.nombre,
      minutes
    });

    if (!result.sent) {
      logger.warn("Correo de recuperacion no enviado: proveedor no configurado", {
        userId: user.id,
        email: user.email,
        reason: result.reason
      });
    }

    return result;
  } catch (error) {
    logger.error("Error enviando correo de recuperacion", {
      userId: user.id,
      email: user.email,
      error: error.message
    });
    return { sent: false, reason: "send_failed" };
  }
};

module.exports = { sendPasswordResetEmail };
