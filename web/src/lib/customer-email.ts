import { getConfiguredAppUrl } from "./app-url";
import { sendEmail } from "./processing/notifications";

export async function sendCustomerVerificationEmail(
  email: string,
  firstName: string,
  token: string,
  storeName?: string,
): Promise<boolean> {
  const base = getConfiguredAppUrl();
  const link = `${base}/verify-email?token=${encodeURIComponent(token)}`;
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  const storeLine = storeName ? `<p>You're selling cards to <strong>${storeName}</strong>.</p>` : "";

  return sendEmail({
    to: email,
    subject: "Verify your email — Card Scanner",
    html: `<p>${greeting}</p>
${storeLine}
<p>Click the link below to verify your email address:</p>
<p><a href="${link}">Verify email</a></p>
<p>If you didn't create an account, you can ignore this email.</p>`,
  });
}

export async function sendCustomerPasswordResetEmail(
  email: string,
  token: string,
): Promise<boolean> {
  const base = getConfiguredAppUrl();
  const link = `${base}/reset-password?token=${encodeURIComponent(token)}`;

  return sendEmail({
    to: email,
    subject: "Reset your password — Card Scanner",
    html: `<p>We received a request to reset your password.</p>
<p><a href="${link}">Reset password</a></p>
<p>If you didn't request this, you can ignore this email.</p>
<p>This link expires in 1 hour.</p>`,
  });
}
