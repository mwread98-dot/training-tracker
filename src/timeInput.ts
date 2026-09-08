export type TimeFieldKind = "duration" | "pace";

// Times are typed as bare digits and grouped from the right, the way a stopwatch
// reads: the last two digits are seconds, the two before them minutes, whatever is
// left over hours. Typing 4,3,0 shows "4:30" and 1,0,5,0,0 shows "1:05:00" — the
// colons are never typed. This is the entry style the VDOT calculator uses.
const MAX_DIGITS: Record<TimeFieldKind, number> = { duration: 6, pace: 4 };

// A pace has no hours slot, so hours fold back into its minutes.
const MAX_SECONDS: Record<TimeFieldKind, number> = {
  duration: 99 * 3600 + 59 * 60 + 59,
  pace: 99 * 60 + 59,
};

// Digits past the cap are dropped rather than shifted in from the right, so
// reaching the limit simply stops accepting input instead of silently
// discarding the hours the coach already typed.
export function extractDigits(value: string, kind: TimeFieldKind) {
  return value.replace(/\D/g, "").slice(0, MAX_DIGITS[kind]);
}

function splitDigits(digits: string) {
  const seconds = Number(digits.slice(-2) || 0);
  const rest = digits.slice(0, -2);
  const minutes = Number(rest.slice(-2) || 0);
  const hours = Number(rest.slice(0, -2) || 0);
  return { hours, minutes, seconds };
}

export function digitsToDisplay(digits: string) {
  if (digits.length <= 2) return digits;
  const seconds = digits.slice(-2);
  const rest = digits.slice(0, -2);
  if (rest.length <= 2) return `${rest}:${seconds}`;
  return `${rest.slice(0, -2)}:${rest.slice(-2)}:${seconds}`;
}

export function digitsToMinutes(digits: string): number | null {
  if (!digits) return null;
  const { hours, minutes, seconds } = splitDigits(digits);
  const total = hours * 60 + minutes + seconds / 60;
  return total > 0 ? total : null;
}

export function minutesToDigits(totalMin: number | null | undefined, kind: TimeFieldKind) {
  if (!totalMin || totalMin <= 0) return "";
  const totalSeconds = Math.min(Math.round(totalMin * 60), MAX_SECONDS[kind]);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const hours = Math.floor(totalSeconds / 3600);
  if (kind === "pace") return `${hours * 60 + minutes}${seconds}`;
  if (hours > 0) return `${hours}${String(minutes).padStart(2, "0")}${seconds}`;
  return `${minutes}${seconds}`;
}

// "4:30" -> "430", so a saved workout can be typed on from where it left off.
export function digitsFromFormatted(value: string | null | undefined, kind: TimeFieldKind) {
  return extractDigits(value ?? "", kind);
}

// Carries an out-of-range entry like "4:99" up into "5:39" so the stored value is
// always canonical. Run on blur, never mid-keystroke.
export function normalizeDigits(digits: string, kind: TimeFieldKind) {
  return minutesToDigits(digitsToMinutes(digits), kind);
}

export function minutesToTimeString(totalMin: number | null | undefined, kind: TimeFieldKind) {
  return digitsToDisplay(minutesToDigits(totalMin, kind));
}
