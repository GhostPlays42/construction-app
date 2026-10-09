import type { MetadataRoute } from "next";

// Lets workers add the app to their phone's home screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Construction App",
    short_name: "Construction",
    description: "Field reports, time cards and safety forms for construction crews.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#f59e0b",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
