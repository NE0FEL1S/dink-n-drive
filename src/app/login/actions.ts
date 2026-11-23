"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { postSignInPath } from "@/lib/auth";
import { safeNextPath } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, signInSchema, signUpSchema, type FieldErrors } from "@/lib/validation";

export type AuthFormState = {
  error?: string;
  fields?: FieldErrors;
  values?: { email?: string; fullName?: string };
};

async function requestOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Starts Google OAuth. Supabase only redirects back to URLs on its allow-list (docs/SETUP.md Part 2.5). */
export async function signInWithGoogle(formData: FormData) {
  const next = safeNextPath(formData.get("next")?.toString());
  const supabase = await createClient();
  const origin = await requestOrigin();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });

  if (error || !data.url) {
    redirect(`/login?error=google&next=${encodeURIComponent(next)}`);
  }
  redirect(data.url);
}

export async function signInWithEmail(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const next = safeNextPath(formData.get("next")?.toString());
  const raw = { email: formData.get("email")?.toString() ?? "", password: formData.get("password")?.toString() ?? "" };
  const parsed = signInSchema.safeParse(raw);
  if (!parsed.success) {
    return { fields: fieldErrors(parsed.error), values: { email: raw.email } };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    const message =
      error?.code === "invalid_credentials"
        ? "That email and password don't match. Signed up with Google? Use the Google button."
        : "We couldn't log you in. Please try again.";
    return { error: message, values: { email: raw.email } };
  }

  redirect(await postSignInPath(data.user.id, next));
}

export async function signUpWithEmail(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const next = safeNextPath(formData.get("next")?.toString());
  const raw = {
    fullName: formData.get("fullName")?.toString() ?? "",
    email: formData.get("email")?.toString() ?? "",
    password: formData.get("password")?.toString() ?? "",
  };
  const values = { email: raw.email, fullName: raw.fullName };
  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) {
    return { fields: fieldErrors(parsed.error), values };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.fullName } },
  });

  if (error) {
    if (error.code === "user_already_exists" || error.code === "email_exists") {
      return { error: "An account with this email already exists. Log in instead.", values };
    }
    if (error.code === "weak_password") {
      return { fields: { password: "Choose a stronger password." }, values };
    }
    return { error: "We couldn't create your account. Please try again.", values };
  }

  if (!data.session || !data.user) {
    // Email confirmation must be OFF in Supabase (no emails in v1). See docs/SETUP.md Part 2.4.
    return { error: "Account created, but sign-in is waiting for email confirmation. Ask the site owner to turn it off.", values };
  }

  redirect(await postSignInPath(data.user.id, next));
}
