/**
 * Minimal RFC 5545 (iCalendar) writer for the athlete calendar feed.
 * Kept free of Amplify imports so it can be exercised on its own.
 */

export type FeedWorkout = {
  entryId: string;
  date: string; // YYYY-MM-DD
  type?: string | null;
  intensity?: string | null;
  title: string;
  description?: string | null;
  distanceKm?: number | null;
  durationMin?: number | null;
  targetPace?: string | null;
  coachNotes?: string | null;
  updatedAt?: string | null;
};

const TYPE_EMOJI: Record<string, string> = {
  run: "🏃",
  bike: "🚴",
  swim: "🏊",
  strength: "🏋️",
  cross_train: "🤸",
  race: "🏁",
};

const TYPE_LABEL: Record<string, string> = {
  run: "Run",
  bike: "Bike",
  swim: "Swim",
  strength: "Strength",
  cross_train: "Cross-training",
  race: "Race",
};

// Stable per workout, so an edited or moved workout replaces its old event
// instead of appearing twice, and a deleted one drops off on the next refresh.
const UID_DOMAIN = "training-tracker";

// A hint only: Apple Calendar and Outlook partly honour it, Google ignores it.
const REFRESH_INTERVAL = "PT1H";

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

// RFC 5545 caps content lines at 75 octets; longer ones continue on the next
// line after a single leading space. Split on code points so emoji and other
// multi-byte characters are never cut in half.
function foldLine(line: string): string {
  const parts: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const char of line) {
    const bytes = Buffer.byteLength(char, "utf8");
    const limit = parts.length === 0 ? 75 : 74; // continuation lines spend 1 octet on the space
    if (currentBytes + bytes > limit) {
      parts.push(current);
      current = "";
      currentBytes = 0;
    }
    current += char;
    currentBytes += bytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

function toIcsDate(isoDate: string): string {
  return isoDate.replace(/-/g, "");
}

function nextDay(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function toIcsTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function formatDistance(km: number): string {
  return `${Number(km.toFixed(2))} km`;
}

function formatDuration(totalMin: number): string {
  const rounded = Math.round(totalMin);
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  if (hours === 0) return `${mins} min`;
  return `${hours}h ${String(mins).padStart(2, "0")}m`;
}

function buildSummary(w: FeedWorkout): string {
  const emoji = w.type ? TYPE_EMOJI[w.type] : undefined;
  const headline = emoji ? `${emoji} ${w.title}` : w.title;
  if (w.distanceKm) return `${headline} · ${formatDistance(w.distanceKm)}`;
  if (w.durationMin) return `${headline} · ${formatDuration(w.durationMin)}`;
  return headline;
}

function buildDescription(w: FeedWorkout): string {
  const lines: string[] = [];
  const typeLabel = w.type ? TYPE_LABEL[w.type] : undefined;
  const kind = [typeLabel, w.intensity].filter(Boolean).join(" · ");
  if (kind) lines.push(kind);
  if (w.distanceKm) lines.push(`Distance: ${formatDistance(w.distanceKm)}`);
  if (w.durationMin) lines.push(`Duration: ${formatDuration(w.durationMin)}`);
  if (w.targetPace) lines.push(`Target pace: ${w.targetPace}`);
  if (w.description?.trim()) lines.push("", w.description.trim());
  if (w.coachNotes?.trim()) lines.push("", `Coach notes: ${w.coachNotes.trim()}`);
  return lines.join("\n");
}

function buildEvent(w: FeedWorkout, stamp: string): string[] {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${w.entryId}@${UID_DOMAIN}`,
    `DTSTAMP:${stamp}`,
    // Workouts have a day but no time, so they show as all-day events. This
    // also sidesteps timezones: the date is the same wherever the phone is.
    `DTSTART;VALUE=DATE:${toIcsDate(w.date)}`,
    `DTEND;VALUE=DATE:${toIcsDate(nextDay(w.date))}`,
    `SUMMARY:${escapeText(buildSummary(w))}`,
    "TRANSP:TRANSPARENT", // don't mark the athlete as busy all day
  ];
  const description = buildDescription(w);
  if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
  if (w.updatedAt) {
    const updated = new Date(w.updatedAt);
    if (!Number.isNaN(updated.getTime())) lines.push(`LAST-MODIFIED:${toIcsTimestamp(updated)}`);
  }
  lines.push("END:VEVENT");
  return lines;
}

export function buildCalendar(workouts: FeedWorkout[], calendarName: string, now = new Date()): string {
  const stamp = toIcsTimestamp(now);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Training Tracker//Calendar Feed//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    `NAME:${escapeText(calendarName)}`,
    `REFRESH-INTERVAL;VALUE=DURATION:${REFRESH_INTERVAL}`,
    `X-PUBLISHED-TTL:${REFRESH_INTERVAL}`,
    ...workouts.flatMap((w) => buildEvent(w, stamp)),
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
