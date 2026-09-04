import { useEffect, useState } from "react";

type Props = {
  goalRaceName?: string | null;
  goalRaceDate?: string | null;
  editable?: boolean;
  onSave?: (data: { goalRaceName: string; goalRaceDate: string }) => void | Promise<void>;
  onClear?: () => void | Promise<void>;
};

function parseIsoDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function todayLocal() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function formatRaceDate(iso: string) {
  return parseIsoDate(iso).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

type CountdownStatus = "upcoming" | "race-week" | "today" | "past";

type Countdown = {
  status: CountdownStatus;
  daysToGo: number;
  weeksToGo: number;
};

// Days-out is the intuitive unit for "how far away is race day", but coaches and
// athletes talk in weeks. Bucket the final 7 days as "race week" (rather than the
// grammatically awkward "1 weeks to go") and ceil everything before that so e.g.
// day 8-14 reads as "2 weeks to go", matching how training plans are usually phrased.
function computeCountdown(raceIso: string): Countdown {
  const msPerDay = 86_400_000;
  const daysToGo = Math.round((parseIsoDate(raceIso).getTime() - todayLocal().getTime()) / msPerDay);

  if (daysToGo < 0) return { status: "past", daysToGo, weeksToGo: 0 };
  if (daysToGo === 0) return { status: "today", daysToGo, weeksToGo: 0 };

  const weeksToGo = Math.ceil(daysToGo / 7);
  if (weeksToGo <= 1) return { status: "race-week", daysToGo, weeksToGo: 1 };
  return { status: "upcoming", daysToGo, weeksToGo };
}

function countdownLabel(countdown: Countdown): { big: string; small: string | null } {
  switch (countdown.status) {
    case "today":
      return { big: "Race day!", small: null };
    case "race-week":
      return {
        big: "Race week",
        small: `${countdown.daysToGo} ${countdown.daysToGo === 1 ? "day" : "days"} to go`,
      };
    case "upcoming":
      return { big: `${countdown.weeksToGo} weeks to go`, small: `${countdown.daysToGo} days` };
    case "past": {
      const daysAgo = -countdown.daysToGo;
      const weeksAgo = Math.floor(daysAgo / 7);
      return {
        big: "Race complete",
        small:
          daysAgo < 7
            ? `${daysAgo} ${daysAgo === 1 ? "day" : "days"} ago`
            : `${weeksAgo} ${weeksAgo === 1 ? "week" : "weeks"} ago`,
      };
    }
  }
}

export default function GoalRacePanel({
  goalRaceName,
  goalRaceDate,
  editable = false,
  onSave,
  onClear,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(goalRaceName ?? "");
  const [dateInput, setDateInput] = useState(goalRaceDate ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) {
      setNameInput(goalRaceName ?? "");
      setDateInput(goalRaceDate ?? "");
    }
  }, [goalRaceName, goalRaceDate, editing]);

  if (!editable && !goalRaceDate) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!dateInput) return;
    setSaving(true);
    try {
      await onSave?.({ goalRaceName: nameInput.trim(), goalRaceDate: dateInput });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setSaving(true);
    try {
      await onClear?.();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="goal-race-panel">
        <form className="goal-race-form" onSubmit={handleSubmit}>
          <div className="row">
            <div className="field">
              <label htmlFor="goal-race-name">Goal race</label>
              <input
                id="goal-race-name"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="e.g. London Marathon"
                autoFocus
              />
            </div>
            <div className="field">
              <label htmlFor="goal-race-date">Race date</label>
              <input
                id="goal-race-date"
                type="date"
                value={dateInput}
                onChange={(e) => setDateInput(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="modal-actions">
            <div>
              {goalRaceDate && (
                <button type="button" className="btn-text" onClick={handleClear} disabled={saving}>
                  Remove goal race
                </button>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving || !dateInput}>
                Save
              </button>
            </div>
          </div>
        </form>
      </div>
    );
  }

  if (!goalRaceDate) {
    return (
      <div className="goal-race-panel goal-race-panel--empty">
        <span>No goal race set yet.</span>
        <button type="button" className="btn btn-primary" onClick={() => setEditing(true)}>
          Set goal race
        </button>
      </div>
    );
  }

  const countdown = computeCountdown(goalRaceDate);
  const label = countdownLabel(countdown);

  return (
    <div className={`goal-race-panel goal-race-panel--${countdown.status}`}>
      <div className="goal-race-info">
        <span className="goal-race-eyebrow">Goal race</span>
        <strong className="goal-race-name">{goalRaceName?.trim() || "Goal race"}</strong>
        <span className="goal-race-date">{formatRaceDate(goalRaceDate)}</span>
        {editable && (
          <button type="button" className="btn-text goal-race-edit" onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
      </div>
      <div className="goal-race-countdown">
        <strong>{label.big}</strong>
        {label.small && <span>{label.small}</span>}
      </div>
    </div>
  );
}
