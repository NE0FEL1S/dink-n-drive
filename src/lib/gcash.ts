import { SUPABASE_URL } from "@/lib/supabase/env";

export type GcashQr = { url: string; downloadUrl: string };

/** Public URLs of the GCash QR in the site-assets bucket (plain + a "download" variant for Save QR). */
export function gcashQr(path: string | null | undefined): GcashQr | null {
  if (!path) return null;
  const url = `${SUPABASE_URL}/storage/v1/object/public/site-assets/${path.split("/").map(encodeURIComponent).join("/")}`;
  return { url, downloadUrl: `${url}?download=dink-n-drive-gcash-qr.jpg` };
}
