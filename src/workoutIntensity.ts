const INTENSITY_LABELS = {
  recovery: "Recovery",
  easy: "Easy",
  steady: "Steady",
  marathon_pace: "Marathon Pace",
  half_marathon_pace: "Half Marathon Pace",
  threshold: "Threshold",
  vo2_max: "VO₂ Max",
  speed_work: "Speedwork",
  race: "Race",
} as const;

type WorkoutIntensity = keyof typeof INTENSITY_LABELS;

export const RUN_INTENSITIES = Object.keys(INTENSITY_LABELS) as WorkoutIntensity[];
export const OTHER_INTENSITIES: readonly WorkoutIntensity[] = ["easy", "marathon_pace", "threshold", "vo2_max", "speed_work"];

export function normalizeWorkoutIntensity(value?: string | null): WorkoutIntensity | undefined {
  const key = value?.trim().toLowerCase().replace(/[\s-]+/g, "_");
  switch (key) {
    case "race_pace": return "marathon_pace";
    case "moderate": return "threshold";
    case "hard":
    case "speedwork": return "speed_work";
    default: return RUN_INTENSITIES.find((intensity) => intensity === key);
  }
}

export function formatIntensityLabel(value: string) {
  const intensity = normalizeWorkoutIntensity(value);
  if (intensity) return INTENSITY_LABELS[intensity];
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
