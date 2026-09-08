import { useLayoutEffect, useRef } from "react";
import { digitsToDisplay, extractDigits, type TimeFieldKind } from "../timeInput";

type Props = {
  id: string;
  kind: TimeFieldKind;
  digits: string;
  onDigitsChange: (digits: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  describedBy?: string;
};

export default function TimeField({
  id,
  kind,
  digits,
  onDigitsChange,
  onBlur,
  placeholder,
  describedBy,
}: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const display = digitsToDisplay(digits);

  // Inserting a colon shifts the text under the caret, so the position the browser
  // restores after a re-render can land in the middle of the value. Digits only ever
  // arrive at the end, so pin the caret there. This runs before paint — the previous
  // requestAnimationFrame version let a frame render with the caret in the wrong place.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || document.activeElement !== el) return;
    try {
      el.setSelectionRange(el.value.length, el.value.length);
    } catch {
      // ignore — not every browser allows selection ranges on every input
    }
  }, [display]);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const next = extractDigits(event.target.value, kind);
    if (next === digits) {
      // The keystroke changed nothing (a digit past the cap, or a stray letter).
      // React re-uses the identical value and skips the render, so the rejected
      // character would stay on screen unless we put the mask back by hand.
      const el = event.target;
      el.value = display;
      el.setSelectionRange(display.length, display.length);
      return;
    }
    onDigitsChange(next);
  }

  return (
    <input
      id={id}
      ref={ref}
      type="text"
      inputMode="numeric"
      placeholder={placeholder}
      value={display}
      onChange={handleChange}
      onBlur={onBlur}
      onFocus={(event) => {
        const end = event.target.value.length;
        event.target.setSelectionRange(end, end);
      }}
      autoComplete="off"
      spellCheck={false}
      aria-describedby={describedBy}
    />
  );
}
