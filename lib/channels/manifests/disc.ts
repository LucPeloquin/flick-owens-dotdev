import type { ChannelManifest } from "../types";

const manifest: ChannelManifest = {
  slug: "disc",
  slot: 0,
  title: "Disc Channel",
  subtitle: "Insert a Game Disc",
  preview: {
    kind: "static",
    src: "/assets/wii/channels/disc/preview.png",
  },
  accent: "#5ab0ff",
  sounds: { enter: "disc-insert" },
  render: () => import("@/components/channels/DiscChannel"),
};

export default manifest;
