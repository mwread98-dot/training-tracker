import { useState } from "react";
import type { DayAvailability } from "./CalendarGrid";

type Props = {
  date: string;
  existingStatus: DayAvailability | null;
  existingNote?: string | null;
  onSave: (status: DayAvailability, note: string) => void;
  onClear?: () => void;
  onClose: () => void;
};

const OPTIONS: { value: DayAvailability; label: string; color: string }[] = [
  { value: "available", label: "Available", color: "#12a150" },
  { value: "tentative", label: "Tentative", color: "#e0a100" },
  { value: "unavailable", label: "Unavailable", color: "#d92d20" },
];

export default function AvailabilityForm({
  date,
  existingStatus,
  existingNote,
  onSave,
  onClear,
  onClose,
}: Props) {
  const [status, setStatus] = useState<DayAvailability>(existingStatus ?? "available");
  const [note, setNote] = useState(existingNote ?? "");

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 4 }}>Set your availability</h3>
        <p style={{ color: "var(--text-muted)", fontSize: 14, marginTop: 0, marginBottom: 16 }}>{date}</p>

        <div className="field">
          <label>Status</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStatus(opt.value)}
                className={status === opt.value ? "btn btn-primary" : "btn"}
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: opt.color,
                    display: "inline-block",
                  }}
                />
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Note (optional)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. travelling, only free evenings, injured…"
          />
        </div>

        <div className="modal-actions">
          <div>
            {existingStatus && onClear && (
              <button type="button" className="btn-text" onClick={onClear}>
                Clear
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={() => onSave(status, note)}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
