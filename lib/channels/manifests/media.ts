import type { ChannelManifest } from "../types";

const manifest: ChannelManifest = {
  slug: "media",
  slot: 3,
  title: "Media Channel",
  subtitle: "Latest posts",
  preview: {
    kind: "static",
    src: "/assets/wii/channels/media/preview.png",
  },
  accent: "#f97316",
  render: () => import("@/components/channels/MediaChannel"),
};

export default manifest;
