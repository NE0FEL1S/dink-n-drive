"use server";

import { isAuthWeakPasswordError } from "@supabase/supabase-js";
import { z } from "zod";
import { requireOwner } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, passwordSchema, phMobileSchema } from "@/lib/validation";

type Fields = Partial<Record<"phone" | "password", string>>;
export type ResetResult = { ok: true; email: string } | { ok: false; error: string; fields?: Fields };

const resetSchema = z.object({
  userId: z.uuid(),
  phone: phMobileSchema,
  password: passwordSchema,
});

/** What the owner reads for each key admin_password_reset_target raises. */
function targetError(key: string): ResetResult {
  switch (key) {
    case "phone_mismatch":
      return {
        ok: false,
        error: "Phone number doesn't match.",
        fields: { phone: "This isn't the phone number on the account. Check it with the customer." },
      };
    case "no_phone_on_file":
      return {
        ok: false,
        error: "This account has no phone number on file, so there's no way to check it's really them. The password wasn't changed.",
      };
    case "not_resettable":
      return { ok: false, error: "This account doesn't log in with a password, so there's nothing to reset." };
    case "not_found":
      return { ok: false, error: "We couldn't find this account. It may have been deleted." };
    case "not_owner":
      return { ok: false, error: "Only the court owner can do this. Please log in again." };
    default:
      console.error("[admin] admin_password_reset_target failed:", key);
      return { ok: false, error: "Something went wrong. The password wasn't changed. Please try again." };
  }
}

/** Supabase's password rules (Authentication → Policies) say why a password was refused. */
function weakPasswordText(error: unknown): string {
  const reasons = isAuthWeakPasswordError(error) ? error.reasons : [];
  if (reasons.includes("pwned")) return "This password shows up in known data leaks. Choose a different one.";
  if (reasons.includes("characters")) return "Mix lowercase and uppercase letters, numbers and symbols.";
  if (reasons.includes("length")) return "This password is too short.";
  return "Choose a stronger password: a longer one with letters, numbers and symbols.";
}

/**
 * Owner-assisted password reset (SPEC §3): the owner types the customer's phone number and a
 * new password. The database checks the phone matches the account's profile; only then is
 * the password changed, with the secret key, on the server. The password is never logged.
 */
export async function setCustomerPassword(input: { userId: string; phone: string; password: string }): Promise<ResetResult> {
  await requireOwner();
  const parsed = resetSchema.safeParse(input);
  if (!parsed.success) {
    const fields = fieldErrors(parsed.error) as Fields;
    if (!fields.phone && !fields.password) return { ok: false, error: "We couldn't find this account. Please refresh the page." };
    return { ok: false, error: "Check the highlighted fields.", fields };
  }
  const { userId, phone, password } = parsed.data;

  // 1. As the owner (RLS + owner check in the function): may this account be reset?
  const supabase = await createClient();
  const { data: email, error } = await supabase.rpc("admin_password_reset_target", { p_user_id: userId, p_phone: phone });
  if (error) return targetError(error.message);

  // 2. Only now, with the secret key: set the new password.
  const { error: authError } = await createAdminClient().auth.admin.updateUserById(userId, { password });
  if (authError) {
    if (isAuthWeakPasswordError(authError) || authError.code === "weak_password") {
      return { ok: false, error: "Choose a stronger password.", fields: { password: weakPasswordText(authError) } };
    }
    console.error("[admin] updateUserById failed:", authError.code ?? "", authError.status ?? "");
    return { ok: false, error: "Something went wrong. The password wasn't changed. Please try again." };
  }

  return { ok: true, email };
}
