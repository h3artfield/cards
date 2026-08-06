"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/Button";
import { adminFetch } from "@/lib/api-client";
import { categoryMeta, type StoreEventCategoryMeta } from "@/lib/store-calendar/categories";
import {
  groupStoreEventsForMonth,
  type EventListGroup,
} from "@/lib/store-calendar/event-list-groups";
import { formatEventTimeRange } from "@/lib/store-calendar/date-utils";
import {
  getEventFlyer,
  type FlyerOrientation,
} from "@/lib/store-calendar/flyer-orientation";
import type { StoreEvent, StoreEventFlyer } from "@/lib/store-calendar/types";

type FlyerResult = {
  imageUrl: string;
  prompt: string;
  eventInfo: string;
  revisedPrompt?: string;
  flyer?: StoreEventFlyer;
  orientation: FlyerOrientation;
};

type Props = {
  events: StoreEvent[];
  month: Date;
  categories: StoreEventCategoryMeta[];
  timeZone?: string;
  onEdit: (event: StoreEvent) => void;
  onEventsChanged?: () => void | Promise<void>;
};

const ORIENTATION_LABEL: Record<FlyerOrientation, string> = {
  portrait: "Portrait (vertical TV)",
  landscape: "Landscape (horizontal TV)",
};

function FlyerPreviewModal({
  group,
  result,
  loading,
  changePrompt,
  onChangePrompt,
  onClose,
  onRecreate,
}: {
  group: EventListGroup;
  result: FlyerResult;
  loading: boolean;
  changePrompt: string;
  onChangePrompt: (value: string) => void;
  onClose: () => void;
  onRecreate: () => void;
}) {
  const downloadName = `${group.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${result.orientation}-flyer.png`;
  const isLandscape = result.orientation === "landscape";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`max-h-[90vh] w-full overflow-y-auto rounded-xl bg-white p-4 shadow-2xl ${
          isLandscape ? "max-w-2xl" : "max-w-md"
        }`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-gray-900">Event flyer</h3>
            <p className="text-xs text-gray-600">{group.title}</p>
            <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-indigo-600">
              {ORIENTATION_LABEL[result.orientation]}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xl text-gray-500 hover:text-gray-800"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={result.imageUrl}
          alt={`${result.orientation} flyer for ${group.title}`}
          className={`mt-3 w-full rounded-lg border ${
            isLandscape ? "aspect-video object-cover" : ""
          }`}
        />

        <label className="mt-4 block text-xs font-semibold text-gray-700">
          Changes to make
          <textarea
            value={changePrompt}
            onChange={(e) => onChangePrompt(e.target.value)}
            rows={3}
            placeholder="e.g. Make the title larger, change background to blue, fix the time text…"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
          />
        </label>
        <p className="mt-1 text-[10px] text-gray-500">
          Leave blank and click Recreate image to generate a brand-new flyer from
          scratch. Add text to edit the current image.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="primary"
            className="!py-2 !text-xs"
            disabled={loading}
            onClick={onRecreate}
          >
            {loading
              ? "Working…"
              : changePrompt.trim()
                ? "Apply changes"
                : "Recreate image"}
          </Button>
          <a
            href={result.imageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-900 hover:bg-gray-50"
          >
            Open full size
          </a>
          <a
            href={result.imageUrl}
            download={downloadName}
            className="inline-flex items-center rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            Download
          </a>
        </div>
      </div>
    </div>
  );
}

function FlyerOrientationActions({
  group,
  orientation,
  loading,
  onView,
  onCreate,
}: {
  group: EventListGroup;
  orientation: FlyerOrientation;
  loading: boolean;
  onView: () => void;
  onCreate: () => void;
}) {
  const saved = getEventFlyer(group.representativeEvent, orientation);
  const shortLabel = orientation === "portrait" ? "Portrait" : "Landscape";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
        {shortLabel}
      </span>
      {saved ? (
        <Button
          type="button"
          variant="secondary"
          className="!py-1 !text-[10px]"
          onClick={onView}
        >
          View
        </Button>
      ) : null}
      <Button
        type="button"
        variant="primary"
        className="!py-1 !text-[10px]"
        disabled={loading}
        onClick={onCreate}
      >
        {loading ? "…" : saved ? "Recreate" : "Create"}
      </Button>
    </div>
  );
}

export function AdminEventList({
  events,
  month,
  categories,
  timeZone,
  onEdit,
  onEventsChanged,
}: Props) {
  const groups = useMemo(
    () => groupStoreEventsForMonth(events, month, { timeZone }),
    [events, month, timeZone],
  );
  const [flyerLoadingKey, setFlyerLoadingKey] = useState<string | null>(null);
  const [flyerError, setFlyerError] = useState<string | null>(null);
  const [flyerPreview, setFlyerPreview] = useState<{
    group: EventListGroup;
    result: FlyerResult;
  } | null>(null);
  const [changePrompt, setChangePrompt] = useState("");

  async function requestFlyer(
    group: EventListGroup,
    orientation: FlyerOrientation,
    promptOverride?: string,
  ) {
    setFlyerLoadingKey(`${group.key}:${orientation}`);
    setFlyerError(null);
    try {
      const res = await adminFetch(
        `/api/admin/store-events/${encodeURIComponent(group.representativeEvent.id)}/flyer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            changePrompt: promptOverride ?? "",
            orientation,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Could not update flyer");
      }
      setFlyerPreview({
        group,
        result: { ...data, orientation: data.orientation ?? orientation },
      });
      setChangePrompt("");
      await onEventsChanged?.();
    } catch (e) {
      setFlyerError(
        e instanceof Error ? e.message : "Could not update flyer",
      );
    } finally {
      setFlyerLoadingKey(null);
    }
  }

  function openFlyerPreview(
    group: EventListGroup,
    orientation: FlyerOrientation,
  ) {
    const saved = getEventFlyer(group.representativeEvent, orientation);
    if (!saved) return;
    setChangePrompt("");
    setFlyerPreview({
      group,
      result: {
        imageUrl: saved.imageUrl,
        prompt: saved.prompt,
        eventInfo: saved.eventInfo,
        revisedPrompt: saved.revisedPrompt,
        flyer: saved,
        orientation,
      },
    });
  }

  function closeFlyerPreview() {
    setFlyerPreview(null);
    setChangePrompt("");
  }

  if (groups.length === 0) {
    return (
      <div className="mt-6 rounded-xl border bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-900">Events this month</h3>
        <p className="mt-2 text-sm text-gray-500">No events in this month yet.</p>
      </div>
    );
  }

  return (
    <>
      <div className="mt-6 rounded-xl border bg-white">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-900">Events this month</h3>
          <p className="mt-1 text-xs text-gray-500">
            {groups.length} event{groups.length === 1 ? "" : "s"} · grouped by
            recurring series · create portrait and/or landscape flyers per event
          </p>
        </div>
        <ul className="divide-y">
          {groups.map((group) => {
            const meta = categoryMeta(group.category, categories);
            const timeRange = formatEventTimeRange(
              group.representativeEvent.startAt,
              group.representativeEvent.endAt,
              group.representativeEvent.allDay,
              timeZone,
            );

            return (
              <li
                key={group.key}
                className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: meta.color }}
                      aria-hidden
                    />
                    <p className="font-medium text-gray-900">{group.title}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        group.isRepeating
                          ? "bg-indigo-100 text-indigo-800"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {group.isRepeating ? "Repeating" : "One-time"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-600">{group.repeatLabel}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {timeRange}
                    {group.isRepeating
                      ? ` · ${group.occurrenceCount} dates this series`
                      : null}
                  </p>
                  {group.isRepeating ? (
                    <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                      {group.scheduleLabel}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="!py-1.5 !text-xs"
                    onClick={() => onEdit(group.representativeEvent)}
                  >
                    Edit
                  </Button>
                  <FlyerOrientationActions
                    group={group}
                    orientation="portrait"
                    loading={flyerLoadingKey === `${group.key}:portrait`}
                    onView={() => openFlyerPreview(group, "portrait")}
                    onCreate={() => void requestFlyer(group, "portrait")}
                  />
                  <FlyerOrientationActions
                    group={group}
                    orientation="landscape"
                    loading={flyerLoadingKey === `${group.key}:landscape`}
                    onView={() => openFlyerPreview(group, "landscape")}
                    onCreate={() => void requestFlyer(group, "landscape")}
                  />
                </div>
              </li>
            );
          })}
        </ul>
        {flyerError ? (
          <p className="border-t px-4 py-3 text-xs text-red-600">{flyerError}</p>
        ) : null}
      </div>

      {flyerPreview ? (
        <FlyerPreviewModal
          group={flyerPreview.group}
          result={flyerPreview.result}
          loading={
            flyerLoadingKey ===
            `${flyerPreview.group.key}:${flyerPreview.result.orientation}`
          }
          changePrompt={changePrompt}
          onChangePrompt={setChangePrompt}
          onClose={closeFlyerPreview}
          onRecreate={() =>
            void requestFlyer(
              flyerPreview.group,
              flyerPreview.result.orientation,
              changePrompt,
            )
          }
        />
      ) : null}
    </>
  );
}
