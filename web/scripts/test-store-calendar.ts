import assert from "node:assert/strict";
import {
  calendarGridDays,
  eventOverlapsDay,
  formatEventTimeRange,
  monthKey,
  monthRangeIso,
} from "../src/lib/store-calendar/date-utils";
import {
  normalizeStoreEventInput,
  normalizeCalendarSettings,
  buildCustomCategoryInput,
} from "../src/lib/store-calendar/normalize";
import {
  eventBlockColor,
  resolveStoreEventCategories,
  slugifyCategoryId,
} from "../src/lib/store-calendar/categories";
import {
  storeCalendarEmbedPath,
  storeCalendarPath,
} from "../src/lib/store-slug";
import {
  eventAcceptsSignups,
  spotsRemaining,
  toPublicStoreEvent,
} from "../src/lib/store-calendar/signup-utils";
import { expandWeeklyOccurrences } from "../src/lib/store-calendar/recurrence";
import { buildFlyerImagePrompt, buildFlyerEventInfo, groupStoreEvents } from "../src/lib/store-calendar/event-list-groups";
import { listStoreFlyersForDisplay } from "../src/lib/store-calendar/list-store-flyers";
import { buildMonthSeedEvents } from "../src/lib/store-calendar/tgl-schedule";

function testMonthRangeIso() {
  const range = monthRangeIso("2026-07");
  assert.ok(range);
  assert.equal(new Date(range!.from).getMonth(), 6);
  assert.equal(new Date(range!.to).getMonth(), 7);
  assert.equal(monthRangeIso("bad"), null);
}

function testCalendarGrid() {
  const july = new Date(2026, 6, 15);
  const days = calendarGridDays(july);
  assert.equal(days.length, 42);
  assert.equal(days[0]!.getDay(), 0);
  assert.equal(monthKey(july), "2026-07");
}

function testEventOverlap() {
  const day = new Date(2026, 6, 10);
  assert.ok(
    eventOverlapsDay(
      {
        startAt: new Date(2026, 6, 10, 13, 0).toISOString(),
        endAt: new Date(2026, 6, 10, 17, 0).toISOString(),
      },
      day,
    ),
  );
}

function testNormalizeEventInput() {
  const event = normalizeStoreEventInput(
    {
      title: "Friday Night Magic",
      category: "magic",
      startAt: "2026-07-04T18:00:00.000Z",
      endAt: "2026-07-04T22:00:00.000Z",
    },
    { storeId: "the-game-lodge" },
  );
  assert.equal(event.title, "Friday Night Magic");
  assert.equal(event.storeId, "the-game-lodge");
  assert.equal(event.category, "magic");
  assert.ok(event.id);
}

function testCalendarSettingsDefaults() {
  const settings = normalizeCalendarSettings(undefined);
  assert.equal(settings.published, false);
  assert.equal(settings.enabled, true);
}

function testCustomCategories() {
  const settings = normalizeCalendarSettings({
    customCategories: [
      { label: "Flesh and Blood", color: "#991b1b" },
      { label: "Pokemon", color: "#000" },
    ],
  });
  assert.equal(settings.customCategories?.length, 1);
  assert.equal(settings.customCategories?.[0]?.id, "flesh-and-blood");

  const merged = resolveStoreEventCategories(settings.customCategories);
  assert.ok(merged.some((c) => c.id === "pokemon" && c.builtin));
  assert.ok(merged.some((c) => c.id === "flesh-and-blood"));

  const custom = buildCustomCategoryInput("Digimon", "#f59e0b", []);
  assert.ok(custom);
  assert.equal(custom!.id, "digimon");

  assert.equal(eventBlockColor("flesh-and-blood", undefined, merged), "#991b1b");
  assert.equal(slugifyCategoryId("  Flesh & Blood  "), "flesh-blood");
}

function testPathsAndColors() {
  assert.equal(storeCalendarPath("the-game-lodge"), "/s/the-game-lodge/calendar");
  assert.equal(
    storeCalendarEmbedPath("the-game-lodge"),
    "/embed/s/the-game-lodge/calendar",
  );
  assert.equal(eventBlockColor("pokemon"), "#c026d3");
  assert.equal(eventBlockColor("other", "#ff0000"), "#ff0000");
}

function testCustomCategoryEvent() {
  const event = normalizeStoreEventInput(
    {
      title: "Armory Night",
      category: "flesh-and-blood",
      startAt: "2026-07-04T18:00:00.000Z",
      endAt: "2026-07-04T22:00:00.000Z",
    },
    { storeId: "the-game-lodge" },
  );
  assert.equal(event.category, "flesh-and-blood");
}

function testCapacityAndSignups() {
  const event = normalizeStoreEventInput(
    {
      title: "Limited Event",
      capacity: 2,
      startAt: "2026-07-04T18:00:00.000Z",
      endAt: "2026-07-04T22:00:00.000Z",
    },
    { storeId: "the-game-lodge" },
  );
  assert.equal(event.capacity, 2);
  assert.equal(spotsRemaining(event, 1), 1);
  assert.equal(spotsRemaining(event, 2), 0);
  assert.equal(eventAcceptsSignups(event, 2), false);
  assert.equal(eventAcceptsSignups(event, 1), true);

  const pub = toPublicStoreEvent(event, 1);
  assert.equal(pub.signupCount, 1);
  assert.equal(pub.spotsRemaining, 1);
}

function testWeeklyRecurrence() {
  const occ = expandWeeklyOccurrences({
    anchorStartAt: "2026-07-06T13:00:00-05:00",
    anchorEndAt: "2026-07-06T17:00:00-05:00",
    weekday: 0,
    until: new Date("2026-07-31T23:59:59-05:00"),
    startTime: "13:00",
    endTime: "17:00",
  });
  assert.ok(occ.length >= 3);
}

testMonthRangeIso();
testCalendarGrid();
testEventOverlap();
testNormalizeEventInput();
testCalendarSettingsDefaults();
testPathsAndColors();
testCustomCategories();
testCustomCategoryEvent();
testCapacityAndSignups();
testWeeklyRecurrence();

function testJulySeedCount() {
  const events = buildMonthSeedEvents("the-game-lodge", 2026, 7);
  assert.ok(events.length >= 40);
  assert.ok(events.some((e) => e.title.includes("Friday Night Magic")));
  assert.ok(events.some((e) => e.title.includes("Lorcana Pre-Release")));
}

testJulySeedCount();

function testFlyerPromptRepeating() {
  const events = [
    {
      id: "a1",
      storeId: "s",
      title: "Pokemon League Night",
      category: "pokemon",
      startAt: "2026-07-06T18:00:00-05:00",
      endAt: "2026-07-06T22:00:00-05:00",
      published: true,
      seriesId: "recurring:Pokemon League Night:1",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    },
    {
      id: "a2",
      storeId: "s",
      title: "Pokemon League Night",
      category: "pokemon",
      startAt: "2026-07-13T18:00:00-05:00",
      endAt: "2026-07-13T22:00:00-05:00",
      published: true,
      seriesId: "recurring:Pokemon League Night:1",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    },
  ];
  const groups = groupStoreEvents(events, { timeZone: "America/Chicago" });
  assert.equal(groups.length, 1);
  assert.ok(groups[0]!.isRepeating);
  assert.ok(groups[0]!.scheduleLabel.includes("JOIN US EVERY MONDAY"));
  assert.ok(groups[0]!.scheduleLabel.includes("6:00 PM"));
  const info = buildFlyerEventInfo(groups[0]!, "The Game Lodge");
  const prompt = buildFlyerImagePrompt(info, "portrait");
  assert.ok(prompt.includes("portrait-orientation"));
  assert.ok(prompt.includes("JOIN US EVERY MONDAY"));
  assert.ok(prompt.includes("6:00 PM"));
}

function testFlyerTimeZoneOnUtcServer() {
  const formatted = formatEventTimeRange(
    "2026-07-06T17:00:00-05:00",
    "2026-07-06T21:00:00-05:00",
    false,
    "America/Chicago",
  );
  assert.match(formatted, /5:00 pm/);
  assert.match(formatted, /9:00 pm/);
  assert.doesNotMatch(formatted, /10:00 pm/);
}

testFlyerPromptRepeating();
testFlyerTimeZoneOnUtcServer();

function testListStoreFlyersForDisplay() {
  const events = [
    {
      id: "a1",
      storeId: "s",
      title: "Pokemon League Night",
      category: "pokemon",
      startAt: "2026-07-06T18:00:00-05:00",
      endAt: "2026-07-06T22:00:00-05:00",
      published: true,
      seriesId: "recurring:Pokemon League Night:1",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
      flyer: {
        imageUrl: "https://example.com/flyer.png",
        prompt: "p",
        eventInfo: "info",
        createdAt: "2026-01-01",
        updatedAt: "2026-01-02",
      },
    },
    {
      id: "a2",
      storeId: "s",
      title: "Pokemon League Night",
      category: "pokemon",
      startAt: "2026-07-13T18:00:00-05:00",
      endAt: "2026-07-13T22:00:00-05:00",
      published: true,
      seriesId: "recurring:Pokemon League Night:1",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    },
  ];
  const flyers = listStoreFlyersForDisplay(events, {
    timeZone: "America/Chicago",
    orientation: "portrait",
  });
  assert.equal(flyers.length, 1);
  assert.equal(flyers[0]!.id, "a1");
  assert.equal(flyers[0]!.source, "event");
  assert.equal(flyers[0]!.orientation, "portrait");
}

testListStoreFlyersForDisplay();

function testListStoreFlyersLandscapeEmpty() {
  const events = [
    {
      id: "a1",
      storeId: "s",
      title: "Pokemon League Night",
      category: "pokemon",
      startAt: "2026-07-06T18:00:00-05:00",
      endAt: "2026-07-06T22:00:00-05:00",
      published: true,
      seriesId: "recurring:Pokemon League Night:1",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
      flyer: {
        imageUrl: "https://example.com/flyer.png",
        prompt: "p",
        eventInfo: "info",
        createdAt: "2026-01-01",
        updatedAt: "2026-01-02",
      },
    },
  ];
  const flyers = listStoreFlyersForDisplay(events, {
    timeZone: "America/Chicago",
    orientation: "landscape",
  });
  assert.equal(flyers.length, 0);
}

testListStoreFlyersLandscapeEmpty();

function testWithoutEventFlyer() {
  const { withoutEventFlyer } = require("../src/lib/store-calendar/flyer-orientation");
  const event = {
    id: "e1",
    storeId: "s",
    title: "FNM",
    category: "magic",
    startAt: "2026-07-06T18:00:00-05:00",
    endAt: "2026-07-06T22:00:00-05:00",
    published: true,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    flyers: {
      portrait: {
        imageUrl: "https://example.com/p.png",
        prompt: "p",
        eventInfo: "info",
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
      },
      landscape: {
        imageUrl: "https://example.com/l.png",
        prompt: "p",
        eventInfo: "info",
        createdAt: "2026-01-01",
        updatedAt: "2026-01-02",
      },
    },
  };
  const cleared = withoutEventFlyer(event, "landscape");
  assert.equal(cleared.flyers?.landscape, undefined);
  assert.ok(cleared.flyers?.portrait);
  assert.equal(
    listStoreFlyersForDisplay([cleared], { orientation: "landscape" }).length,
    0,
  );
}

testWithoutEventFlyer();

console.log("store-calendar tests passed");
