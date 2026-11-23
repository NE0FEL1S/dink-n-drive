import type { Metadata, Viewport } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz"],
  style: ["normal", "italic"],
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: {
    default: "Dink n' Drive · Pickleball court in Luyang",
    template: "%s · Dink n' Drive",
  },
  description: "Book Luyang's own pickleball court by the hour. Pick your hours, pay with GCash, then just show up and play.",
  applicationName: "Dink n' Drive",
  appleWebApp: { title: "Dink n' Drive", capable: true, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#FFFFFF",
  colorScheme: "light",
};

// The landing page (/) draws its own nav inside the ice panel; every other page
// gets the sticky header from src/app/(site)/layout.tsx.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${fraunces.variable} ${jakarta.variable} antialiased`}>
      <body className="flex min-h-dvh flex-col">{children}</body>
    </html>
  );
}
