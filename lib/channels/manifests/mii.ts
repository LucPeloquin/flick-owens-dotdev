import type { ChannelManifest } from "../types";

const manifest: ChannelManifest = {
  slug: "mii",
  slot: 1,
  title: "Mii Channel",
  subtitle: "Meet my Mii",
  preview: {
    kind: "static",
    src: "/assets/wii/channels/mii/preview.png",
  },
  accent: "#f28fae",
  render: () => import("@/components/channels/MiiChannel"),
};

export default manifest;
