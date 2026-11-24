import { z } from "zod";
import { toE164PhMobile } from "./phone";

export const fullNameSchema = z
  .string()
  .trim()
  .min(2, "Enter your full name.")
  .max(100, "Name is too long (100 characters max).");

/** Name on the customer's GCash account (for refunds). */
export const gcashNameSchema = z
  .string()
  .trim()
  .min(2, "Enter the name on the GCash account.")
  .max(100, "Name is too long (100 characters max).");

/** Input `09XXXXXXXXX` → output `+639XXXXXXXXX`. */
export const phMobileSchema = z
  .string()
  .trim()
  .min(1, "Enter your mobile number.")
  .transform((value, ctx) => {
    const e164 = toE164PhMobile(value);
    if (!e164) {
      ctx.addIssue({ code: "custom", message: "Use an 11-digit PH mobile number, like 09171234567." });
      return z.NEVER;
    }
    return e164;
  });

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address."));

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72, "Password is too long (72 characters max).");

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});

export const signUpSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const profileSchema = z.object({
  fullName: fullNameSchema,
  phone: phMobileSchema,
});

/** Field errors keyed by field name, first message only. */
export type FieldErrors = Partial<Record<string, string>>;

export function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
