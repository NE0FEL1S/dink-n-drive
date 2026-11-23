import { ImageResponse } from "next/og";
import { logoMarkupString } from "@/components/logo-mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS "Add to Home Screen" icon: the logo mark, full-bleed (iOS rounds the corners itself).
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="180" height="180">${logoMarkupString("t", { rounded: false })}</svg>`;

export default function AppleIcon() {
  return new ImageResponse(
    (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`} width={180} height={180} alt="" />
    ),
    size,
  );
}
