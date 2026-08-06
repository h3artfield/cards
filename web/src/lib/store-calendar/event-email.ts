import { getConfiguredAppUrl } from "../app-url";
import { sendEmail } from "../processing/notifications";
import { formatEventTimeRange } from "./date-utils";
import type { StoreEvent, StoreEventSignup } from "./types";
import { buildStoreCalendarUrl } from "../store-slug";

export async function sendEventSignupConfirmationEmail(
  signup: StoreEventSignup,
  event: StoreEvent,
  storeName: string,
  storeSlug: string,
  timeZone?: string,
): Promise<boolean> {
  const when = formatEventTimeRange(
    event.startAt,
    event.endAt,
    event.allDay,
    timeZone,
  );
  const name = signup.firstName || "there";

  return sendEmail({
    to: signup.email,
    subject: `You're signed up — ${event.title}`,
    html: `<p>Hi ${name},</p>
<p>You're registered for <strong>${event.title}</strong> at ${storeName}.</p>
<p><strong>When:</strong> ${when}</p>
${event.description ? `<p>${event.description}</p>` : ""}
<p>— ${storeName}</p>`,
  });
}

export async function sendEventAnnouncementEmail(
  email: string,
  firstName: string,
  event: StoreEvent,
  storeName: string,
  storeSlug: string,
  customMessage?: string,
  timeZone?: string,
): Promise<boolean> {
  const when = formatEventTimeRange(
    event.startAt,
    event.endAt,
    event.allDay,
    timeZone,
  );
  const calendarUrl = buildStoreCalendarUrl(storeSlug, getConfiguredAppUrl());
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  const extra = customMessage?.trim()
    ? `<p>${customMessage.trim().replace(/\n/g, "<br/>")}</p>`
    : "";

  return sendEmail({
    to: email,
    subject: `Upcoming event at ${storeName} — ${event.title}`,
    html: `<p>${greeting}</p>
<p>Join us for <strong>${event.title}</strong>!</p>
<p><strong>When:</strong> ${when}</p>
${event.description ? `<p>${event.description}</p>` : ""}
${extra}
<p><a href="${calendarUrl}">View the store calendar and sign up</a></p>
<p>— ${storeName}</p>`,
  });
}
