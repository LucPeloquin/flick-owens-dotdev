import type { ChannelManifest } from "../types";

const manifest: ChannelManifest = {
  slug: "mp3",
  slot: 2,
  title: ".MP3 Channel",
  subtitle: "Top 100",
  preview: {
    kind: "color",
    color: "linear-gradient(180deg, #3b82f6 0%, #1d4ed8 100%)",
    icon: "music",
    label: ".MP3",
  },
  accent: "#3b82f6",
  render: () => import("@/components/channels/MP3Channel"),
};

export default manifest;
