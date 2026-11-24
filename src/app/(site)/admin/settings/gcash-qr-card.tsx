"use client";

import { useCallback, useEffect, useState } from "react";
import { ImageUp, QrCode } from "lucide-react";
import { Button, Spinner } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/field";
import { Toast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { saveNewQr, startQrUpload } from "./actions";

type Phase = "idle" | "compressing" | "uploading" | "saving";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

/**
 * Replace the GCash QR customers scan when they pay (SPEC §4 Settings). The image is
 * compressed in the browser, uploaded through a one-time signed URL into site-assets, then
 * the setting points at it and the old file is deleted.
 */
export function GcashQrCard({ current }: { current: string | null }) {
  const [picked, setPicked] = useState<{ file: File; url: string } | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(0);
  const dismiss = useCallback(() => setSaved(0), []);
  const file = picked?.file ?? null;
  const preview = picked?.url ?? null;

  /** Keeps one preview URL alive at a time (blob: URLs hold the image in memory). */
  function setFile(next: File | null) {
    if (picked) URL.revokeObjectURL(picked.url);
    setPicked(next ? { file: next, url: URL.createObjectURL(next) } : null);
  }
  useEffect(() => () => {
    if (picked) URL.revokeObjectURL(picked.url);
  }, [picked]);

  async function save() {
    if (!file) return;
    setError(null);
    try {
      // A QR needs sharp edges, so a normal QR image (JPG/PNG/WebP under 1 MB) is uploaded as is;
      // only big photos are shrunk (high quality, still well under the 2 MB bucket limit).
      let upload: Blob = file;
      if (!ACCEPTED.includes(file.type) || file.size > 1024 * 1024) {
        setPhase("compressing");
        const { default: compress } = await import("browser-image-compression");
        upload = await compress(file, { maxSizeMB: 1, maxWidthOrHeight: 1400, fileType: "image/jpeg", initialQuality: 0.92, useWebWorker: true });
      }

      setPhase("uploading");
      const start = await startQrUpload(upload.type);
      if (!start.ok) throw new Error(start.error);
      const { error: uploadError } = await createClient()
        .storage.from("site-assets")
        .uploadToSignedUrl(start.path, start.token, upload, { contentType: upload.type });
      if (uploadError) throw new Error("The upload didn't finish. Please try again.");

      setPhase("saving");
      const r = await saveNewQr(start.path);
      if (!r.ok) throw new Error(r.error);
      setFile(null);
      setSaved(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setPhase("idle");
    }
  }

  const busy = phase !== "idle";

  return (
    <Card className="grid gap-4">
      {saved > 0 && (
        <Toast key={saved} tone="success" onDismiss={dismiss}>
          New GCash QR saved. Customers see it when they pay.
        </Toast>
      )}
      <div className="grid gap-1">
        <h2 className="text-[20px] leading-7 font-bold text-navy-900">GCash QR</h2>
        <p className="text-sm text-slate-500">
          Customers scan this to pay. In GCash, open <b className="font-semibold text-navy-700">Receive → QR</b> and save the
          image, then upload it here.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <figure className="grid gap-2">
          <figcaption className="text-sm font-semibold text-navy-900">Now</figcaption>
          {current ? (
            // eslint-disable-next-line @next/next/no-img-element -- public image in Supabase Storage
            <img src={current} alt="Current GCash QR" className="w-full max-w-[240px] rounded-[var(--radius-control)] border border-line bg-white" />
          ) : (
            <div className="grid h-40 max-w-[240px] place-items-center rounded-[var(--radius-control)] border border-dashed border-line bg-ice-50 p-4 text-center">
              <QrCode className="size-6 text-slate-500" aria-hidden="true" />
              <p className="text-sm text-slate-500">No QR yet. Customers can&apos;t pay until you add one.</p>
            </div>
          )}
        </figure>

        <div className="grid content-start gap-3">
          <p className="text-sm font-semibold text-navy-900">Replace</p>
          {preview ? (
            <figure className="grid gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- local preview of the chosen file (blob: URL) */}
              <img src={preview} alt="New GCash QR" className="w-full max-w-[240px] rounded-[var(--radius-control)] border border-line bg-white" />
              <label htmlFor="qr-file" className="w-fit cursor-pointer text-sm font-semibold text-glacier-700 hover:underline">
                Choose a different image
              </label>
            </figure>
          ) : (
            <label
              htmlFor="qr-file"
              className="grid min-h-40 max-w-[240px] cursor-pointer place-items-center gap-1 rounded-[var(--radius-control)] border-2 border-dashed border-line bg-ice-50 p-4 text-center hover:border-orange-500/50 active:bg-ice-100"
            >
              <ImageUp className="size-6 text-orange-500" aria-hidden="true" />
              <span className="text-[15px] font-semibold text-navy-900">Choose the QR image</span>
              <span className="text-sm text-slate-500">JPG or PNG</span>
            </label>
          )}
          <input
            id="qr-file"
            type="file"
            accept={ACCEPTED.join(",")}
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              setError(null);
              setFile(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
          {error && <FormMessage tone="error">{error}</FormMessage>}
          <Button className="relative w-full sm:w-fit" disabled={!file || busy} aria-busy={busy || undefined} onClick={save}>
            <span className={busy ? "invisible" : undefined}>Save new QR</span>
            {busy && (
              <span className="absolute inset-0 flex items-center justify-center gap-2">
                <Spinner />
                {phase === "compressing" ? "Preparing…" : phase === "uploading" ? "Uploading…" : "Saving…"}
              </span>
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}
