import { useState } from "react";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "../../amplify/data/resource";
import outputs from "../../amplify_outputs.json";

const client = generateClient<Schema>();

// Present once the backend with the calendar-feed Lambda has been deployed.
const FEED_BASE_URL: string | undefined = (outputs as { custom?: { calendarFeedUrl?: string } }).custom
  ?.calendarFeedUrl;

export const CALENDAR_FEED_ENABLED = !!FEED_BASE_URL;

function generateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function feedUrl(token: string) {
  return `${FEED_BASE_URL!.replace(/\/+$/, "")}/${token}.ics`;
}

// Google has no one-click subscribe that works for this feed: its `?cid=` link
// refuses https:// URLs, and fetches webcal:// ones over plain http://, which a
// Lambda Function URL doesn't serve — the calendar gets added but stays empty.
// Pasting the https:// link into "Add calendar → From URL" does work, and
// Google offers no way to pre-fill that box, so the athlete pastes it there.
const GOOGLE_ADD_BY_URL = "https://calendar.google.com/calendar/u/0/r/settings/addbyurl";

type GoogleStep = "idle" | "copied" | "copy_failed";

type Props = {
  email: string;
  idToken: string;
  initialToken: string | null;
  // "prompt" invites the athlete to set it up; "manage" is the row in the
  // Connections section once a calendar app is using the feed.
  variant: "prompt" | "manage";
};

export default function CalendarSubscribe({ email, idToken, initialToken, variant }: Props) {
  const [token, setToken] = useState(initialToken);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [googleStep, setGoogleStep] = useState<GoogleStep>("idle");
  const [error, setError] = useState<string | null>(null);

  if (!FEED_BASE_URL) return null;

  // Creating and resetting are the same write: a fresh token replaces the old
  // one, which stops any calendar still subscribed to the old link. Clearing
  // lastFetchedAt means the new link only counts as connected once a calendar
  // app has fetched it.
  async function issueToken() {
    setBusy(true);
    setError(null);
    const next = generateToken();
    const payload = { athleteEmail: email, token: next, lastFetchedAt: null };
    const options = { authMode: "userPool" as const, authToken: idToken };
    const { errors } = token
      ? await client.models.CalendarFeed.update(payload, options)
      : await client.models.CalendarFeed.create(payload, options);
    setBusy(false);
    if (errors?.length) {
      console.error("Failed to save calendar feed", errors);
      setError("Couldn't create your calendar link. Please try again.");
      return;
    }
    setToken(next);
    setCopied(false);
    setGoogleStep("idle");
  }

  async function handleReset() {
    const ok = window.confirm(
      "Reset your calendar link? Any calendar subscribed to the current link will stop updating, and you'll need to subscribe again with the new one."
    );
    if (ok) await issueToken();
  }

  async function handleCopy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      window.prompt("Copy your calendar link:", url);
    }
  }

  // Copies the link and shows the steps, but leaves opening Google to the
  // athlete, so they've seen the link is copied before they need to paste it.
  async function handleGoogle(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setGoogleStep("copied");
    } catch {
      setGoogleStep("copy_failed");
    }
  }

  const url = token ? feedUrl(token) : null;
  const webcalUrl = url?.replace(/^https?:\/\//, "webcal://");

  const body = (
    <div className="calendar-sub-body">
      {!url ? (
        <>
          <p>
            This creates a private link that your calendar app subscribes to. Your planned sessions
            show up as all-day events and stay in sync when your coach changes them.
          </p>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={issueToken}>
            {busy ? "Creating…" : "Create my calendar link"}
          </button>
        </>
      ) : (
        <>
          <div className="calendar-sub-actions">
            <a className="btn btn-primary" href={webcalUrl}>
              iPhone / Mac
            </a>
            <button type="button" className="btn" onClick={() => handleGoogle(url)}>
              Google Calendar
            </button>
            <button type="button" className="btn" onClick={() => handleCopy(url)}>
              {copied ? "Copied ✓" : "Copy link"}
            </button>
          </div>
          {googleStep !== "idle" && (
            <ol className="calendar-sub-steps">
              <li>
                {googleStep === "copied" ? (
                  <strong>Link copied ✓</strong>
                ) : (
                  <>
                    Copy this link:
                    <input
                      className="calendar-sub-url"
                      readOnly
                      value={url}
                      onFocus={(e) => e.currentTarget.select()}
                      aria-label="Your calendar link"
                    />
                  </>
                )}
              </li>
              <li>
                Open Google Calendar, paste the link into <strong>URL of calendar</strong> and click{" "}
                <strong>Add calendar</strong>.
                <div>
                  <a className="btn btn-primary" href={GOOGLE_ADD_BY_URL} target="_blank" rel="noreferrer">
                    Open Google Calendar
                  </a>
                </div>
                <p className="calendar-sub-hint">
                  Do this on a computer. It then shows up on your phone too.
                </p>
              </li>
            </ol>
          )}
          <p className="calendar-sub-hint">
            Using Outlook or something else? Copy the link and add it as a calendar subscription
            ("subscribe from web" or "add calendar from URL"). Keep the link private: anyone with it
            can see your plan.
          </p>
          <p className="calendar-sub-hint">
            Calendar apps check for changes on their own schedule, so updates can take a few hours to
            appear (Google can take up to a day).
          </p>
          <button type="button" className="btn-text" disabled={busy} onClick={handleReset}>
            {busy ? "Resetting…" : "Reset link"}
          </button>
        </>
      )}
      {error && <p className="calendar-sub-error">{error}</p>}
    </div>
  );

  if (variant === "manage") {
    return (
      <div className="connection">
        <div className="connection-row">
          <div className="connection-info">
            <span className="connection-name">
              <span className="connection-icon" aria-hidden="true">
                📅
              </span>
              Calendar
            </span>
            <span className="connection-status">Connected</span>
          </div>
          <button type="button" className="btn" onClick={() => setOpen(!open)}>
            {open ? "Close" : "Add to another calendar"}
          </button>
        </div>
        {open && body}
      </div>
    );
  }

  if (!open) {
    return (
      <div className="calendar-sub-banner">
        <span>📅 See your training plan in your phone's calendar app.</span>
        <button type="button" className="btn" onClick={() => setOpen(true)}>
          Add to calendar
        </button>
      </div>
    );
  }

  return (
    <div className="calendar-sub-panel">
      <div className="calendar-sub-header">
        <strong>Add your training plan to your calendar</strong>
        <button type="button" className="btn-text" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      {body}
    </div>
  );
}
