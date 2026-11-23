"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps } from "react";
import { buttonClass, Spinner } from "./button";

type Props = Omit<ComponentProps<"button">, "type"> & {
  variant?: Parameters<typeof buttonClass>[0];
  /** Force the pending state (e.g. from useActionState). */
  pending?: boolean;
};

/** Submit button that keeps its width, shows a spinner and blocks double-submits while pending. */
export function SubmitButton({ variant = "primary", className = "", pending, children, disabled, ...props }: Props) {
  const status = useFormStatus();
  const isPending = pending ?? status.pending;

  return (
    <button
      type="submit"
      className={buttonClass(variant, `relative ${className}`)}
      disabled={disabled || isPending}
      aria-busy={isPending || undefined}
      {...props}
    >
      <span className={isPending ? "invisible" : undefined}>{children}</span>
      {isPending && (
        <span className="absolute inset-0 grid place-items-center">
          <Spinner />
        </span>
      )}
    </button>
  );
}
