import type { ChannelManifest } from "../types";

const manifest: ChannelManifest = {
  slug: "mii",
  slot: 1,
  title: "Mii Channel",
  subtitle: "Meet my Mii",
  preview: {
    kind: "color",
    color: "linear-gradient(180deg, #f6b9d0 0%, #f28fae 100%)",
    icon: "mii",
    label: "Mii",
  },
  accent: "#f28fae",
  render: () => import("@/components/channels/MiiChannel"),
};

export default manifest;
