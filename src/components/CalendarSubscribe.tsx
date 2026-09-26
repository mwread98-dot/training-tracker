import { useEffect, useState } from "react";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "../../amplify/data/resource";
import outputs from "../../amplify_outputs.json";

const client = generateClient<Schema>();

// Present once the backend with the calendar-feed Lambda has been deployed.
const FEED_BASE_URL: string | undefined = (outputs as { custom?: { calendarFeedUrl?: string } }).custom
  ?.calendarFeedUrl;

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
// Google offers no way to pre-fill that box, so copy the link and open the page.
const GOOGLE_ADD_BY_URL = "https://calendar.google.com/calendar/u/0/r/settings/addbyurl";

type GoogleStep = "idle" | "copied" | "copy_failed";

type Props = {
  email: string;
  idToken: string;
};

export default function CalendarSubscribe({ email, idToken }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [googleStep, setGoogleStep] = useState<GoogleStep>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!FEED_BASE_URL) return;
    (async () => {
      const { data, errors } = await client.models.CalendarFeed.get(
        { athleteEmail: email },
        { authMode: "userPool", authToken: idToken }
      );
      if (errors?.length) {
        console.error("Failed to load calendar feed", errors);
      } else {
        setToken(data?.token ?? null);
      }
      setLoaded(true);
    })();
  }, [email, idToken]);

  if (!FEED_BASE_URL || !loaded) return null;

  // Creating and resetting are the same write: a fresh token replaces the old
  // one, which stops any calendar still subscribed to the old link.
  async function issueToken() {
    setBusy(true);
    setError(null);
    const next = generateToken();
    const payload = { athleteEmail: email, token: next };
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

  // Copy first: once the new tab takes focus, the clipboard write would be refused.
  async function handleGoogle(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setGoogleStep("copied");
    } catch {
      setGoogleStep("copy_failed");
    }
    // Browsers that block this (Safari can, after the await) still get the
    // "Open Google Calendar" link in the instructions below.
    window.open(GOOGLE_ADD_BY_URL, "_blank", "noopener,noreferrer");
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

  const url = token ? feedUrl(token) : null;
  const webcalUrl = url?.replace(/^https?:\/\//, "webcal://");

  return (
    <div className="calendar-sub-panel">
      <div className="calendar-sub-header">
        <strong>Add your training plan to your calendar</strong>
        <button type="button" className="btn-text" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>

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
            <div className="calendar-sub-google">
              {googleStep === "copied" ? (
                <p>
                  <strong>Link copied.</strong> In the Google Calendar tab, paste it into{" "}
                  <strong>URL of calendar</strong> and click <strong>Add calendar</strong>.
                </p>
              ) : (
                <>
                  <p>
                    Copy this link, then in the Google Calendar tab paste it into{" "}
                    <strong>URL of calendar</strong> and click <strong>Add calendar</strong>.
                  </p>
                  <input
                    className="calendar-sub-url"
                    readOnly
                    value={url}
                    onFocus={(e) => e.currentTarget.select()}
                    aria-label="Your calendar link"
                  />
                </>
              )}
              <p className="calendar-sub-hint">
                No new tab?{" "}
                <a href={GOOGLE_ADD_BY_URL} target="_blank" rel="noreferrer">
                  Open Google Calendar
                </a>
                . Do this on a computer: Google Calendar's phone app can't add a calendar from a link,
                but once it's added it shows up on your phone too.
              </p>
            </div>
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
}
