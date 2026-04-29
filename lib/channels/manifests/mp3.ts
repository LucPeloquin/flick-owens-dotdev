import type { ChannelManifest } from "../types";

const manifest: ChannelManifest = {
  slug: "mp3",
  slot: 2,
  title: ".MP3 Channel",
  subtitle: "Top 100",
  preview: {
    kind: "static",
    src: "/assets/wii/channels/mp3/preview.png",
  },
  accent: "#3b82f6",
  render: () => import("@/components/channels/MP3Channel"),
};

export default manifest;
