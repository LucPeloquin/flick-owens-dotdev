import type { ChannelManifest } from "../types";

const manifest: ChannelManifest = {
  slug: "media",
  slot: 3,
  title: "Media Channel",
  subtitle: "Latest posts",
  preview: {
    kind: "color",
    color: "linear-gradient(180deg, #f97316 0%, #c2410c 100%)",
    icon: "media",
    label: "Media",
  },
  accent: "#f97316",
  render: () => import("@/components/channels/MediaChannel"),
};

export default manifest;
