"use server";

import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { safeNextPath } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, profileSchema, type FieldErrors } from "@/lib/validation";

export type ProfileFormState = {
  error?: string;
  fields?: FieldErrors;
  saved?: boolean;
  values?: { fullName?: string; phone?: string };
};

export async function updateProfile(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  // Re-check the session here: a Server Action is a public endpoint.
  const userId = await getUserId();
  if (!userId) redirect("/login?next=/profile");

  const raw = {
    fullName: formData.get("fullName")?.toString() ?? "",
    phone: formData.get("phone")?.toString() ?? "",
  };
  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) {
    return { fields: fieldErrors(parsed.error), values: raw };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.fullName, phone: parsed.data.phone })
    .eq("id", userId);

  if (error) {
    return { error: "We couldn't save your details. Please try again.", values: raw };
  }

  const next = formData.get("next")?.toString();
  if (next) redirect(safeNextPath(next));

  return { saved: true, values: raw };
}
