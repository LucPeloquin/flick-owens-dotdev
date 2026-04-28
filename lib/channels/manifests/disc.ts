import type { ChannelManifest } from "../types";

const manifest: ChannelManifest = {
  slug: "disc",
  slot: 0,
  title: "Disc Channel",
  subtitle: "Insert a Game Disc",
  preview: {
    kind: "color",
    color: "linear-gradient(160deg, #1a1a1a 0%, #2e2e2e 60%, #070707 100%)",
    icon: "disc",
    label: "DISC",
  },
  accent: "#5ab0ff",
  sounds: { enter: "disc-insert" },
  render: () => import("@/components/channels/DiscChannel"),
};

export default manifest;
