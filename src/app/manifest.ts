import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dink n' Drive",
    short_name: "Dink n' Drive",
    description: "Book Luyang's own pickleball court by the hour.",
    start_url: "/",
    display: "standalone",
    background_color: "#F4F8FB",
    theme_color: "#FFFFFF",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
