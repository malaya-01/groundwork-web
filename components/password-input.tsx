'use client';

import { useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  /** Classes for the wrapper (default: full width). */
  wrapperClassName?: string;
  /** Classes for the eye button, so it can match light paper or a dark card. */
  toggleClassName?: string;
};

/** A password field with a show/hide (eye) button inside its right edge. */
export function PasswordInput({
  wrapperClassName = 'relative flex w-full items-center',
  toggleClassName = 'text-[color:var(--label)] hover:text-[color:var(--ink)]',
  style,
  ...rest
}: Props) {
  const [shown, setShown] = useState(false);
  const label = shown ? 'Hide password' : 'Show password';
  return (
    <span className={wrapperClassName}>
      {/* Inline padding: unlayered classes like .hand-input would override a Tailwind pr-* utility. */}
      <input {...rest} type={shown ? 'text' : 'password'} style={{ ...style, paddingRight: '2.25rem' }} />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        onMouseDown={(e) => e.preventDefault()} // keep the cursor in the field
        aria-label={label}
        aria-pressed={shown}
        title={label}
        className={`absolute right-1 grid h-7 w-7 place-items-center rounded-md ${toggleClassName}`}
      >
        {shown ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </span>
  );
}
