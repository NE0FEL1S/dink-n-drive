import { useId, type ComponentProps, type ReactNode } from "react";

type FieldProps = ComponentProps<"input"> & {
  label: string;
  error?: string;
  hint?: ReactNode;
};

/**
 * Label above, 48px input, error below (DESIGN §4). Inputs are 16px so iOS
 * Safari doesn't zoom on focus.
 */
export function Field({ label, error, hint, id, className = "", ...props }: FieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className="grid gap-1.5">
      <label htmlFor={inputId} className="text-sm font-semibold text-navy-900">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        className={
          "h-12 w-full rounded-[var(--radius-control)] border bg-white px-4 text-base text-navy-900 " +
          "placeholder:text-slate-300 outline-none transition-[border-color,box-shadow] duration-150 " +
          "focus:border-orange-600 focus:ring-2 focus:ring-orange-500/40 " +
          "read-only:bg-ice-50 read-only:text-slate-500 " +
          (error ? "border-danger " : "border-line ") +
          className
        }
        {...props}
      />
      {hint && !error && (
        <p id={hintId} className="text-sm text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function FormMessage({ tone, children }: { tone: "error" | "success" | "info"; children: ReactNode }) {
  const tones = {
    error: "bg-danger-bg text-danger",
    success: "bg-success-bg text-success",
    info: "bg-info-bg text-info",
  } as const;
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`rounded-[var(--radius-control)] px-4 py-3 text-sm font-medium ${tones[tone]}`}>
      {children}
    </p>
  );
}
