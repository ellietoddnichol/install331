import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { parseNumericInput } from '../utils/numericInput';

export type TransientNumericFieldConfig = {
  /** When this changes, local text resets from `committed` (e.g. selected row id). */
  syncKey: string;
  committed: number;
  onLive: (n: number) => void;
  onCommit: (n: number) => void;
  /** Used when the field is left empty on blur. */
  emptyCoercesTo?: number;
};

/**
 * Local string state for a number field so the user can clear "0" and type a new value.
 * Commits coerced number on blur; calls onLive when a finite number is parseable while typing.
 */
export function useTransientNumericField({
  syncKey,
  committed,
  onLive,
  onCommit,
  emptyCoercesTo = 0,
}: TransientNumericFieldConfig) {
  const onLiveRef = useRef(onLive);
  const onCommitRef = useRef(onCommit);
  onLiveRef.current = onLive;
  onCommitRef.current = onCommit;

  const [text, setText] = useState(() => String(committed));

  useEffect(() => {
    setText(String(committed));
  }, [syncKey, committed]);

  return {
    inputProps: {
      type: 'number' as const,
      value: text,
      onChange: (e: ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;
        setText(raw);
        const n = parseNumericInput(raw);
        if (n !== null) onLiveRef.current(n);
      },
      onBlur: () => {
        const n = parseNumericInput(text);
        const final = n ?? emptyCoercesTo;
        onCommitRef.current(final);
        setText(String(final));
      },
    },
  };
}
