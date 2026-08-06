import { NextRequest } from "next/server";
import {
  requireAdminSession,
  requireStoreScope,
} from "@/lib/admin-auth";
import { dataStore } from "@/lib/storage/data-store";
import { jsonError, jsonOk, handleRouteError } from "@/lib/api-utils";
import { addGalleryFlyer } from "@/lib/store-calendar/display-gallery";
import { parseFlyerOrientation } from "@/lib/store-calendar/flyer-orientation";
import {
  DEFAULT_CALENDAR_SETTINGS,
  type DisplayGalleryFlyer,
  type DisplayGalleryMediaType,
} from "@/lib/store-calendar/types";
import { persistGalleryFlyerImage } from "@/lib/storage/event-flyer-image";

function parseGalleryMedia(
  dataUrl: string,
): { mediaType: DisplayGalleryMediaType } | null {
  if (dataUrl.startsWith("data:image/")) return { mediaType: "image" };
  if (dataUrl.startsWith("data:video/")) return { mediaType: "video" };
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireAdminSession(request);
    if (auth instanceof Response) return auth;

    const scope = requireStoreScope(auth, request);
    if (scope instanceof Response) return scope;

    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const orientation = parseFlyerOrientation(body.orientation);
    const mediaDataUrl = String(
      body.mediaDataUrl ??
        body.imageDataUrl ??
        body.image ??
        body.imageUrl ??
        body.videoDataUrl ??
        "",
    ).trim();
    const title =
      String(body.title ?? "Custom media").trim() || "Custom media";
    const caption = String(body.caption ?? "").trim() || undefined;

    const parsed = parseGalleryMedia(mediaDataUrl);
    if (!parsed) {
      return jsonError("A valid image or video file is required", 400);
    }

    const id = crypto.randomUUID();
    const imageUrl = await persistGalleryFlyerImage(
      scope.storeId,
      id,
      mediaDataUrl,
      orientation,
    );

    const now = new Date().toISOString();
    const flyer: DisplayGalleryFlyer = {
      id,
      title,
      imageUrl,
      mediaType: parsed.mediaType,
      caption,
      orientation,
      createdAt: now,
      updatedAt: now,
    };

    const settings = await dataStore.getSettings(scope.storeId);
    const calendar = settings.calendarSettings ?? DEFAULT_CALENDAR_SETTINGS;
    await dataStore.saveSettings({
      ...settings,
      calendarSettings: addGalleryFlyer(calendar, flyer),
    });

    await dataStore.logAdminAction({
      action: "add_display_gallery_flyer",
      flyerId: id,
      orientation,
      mediaType: parsed.mediaType,
    });

    return jsonOk({ flyer });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Storage")) {
      return jsonError(err.message, 502);
    }
    return handleRouteError(err);
  }
}
