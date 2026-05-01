import type { ChannelManifest } from "../types";

const manifest: ChannelManifest = {
  slug: "disc",
  slot: 0,
  title: "Game Boy Player",
  subtitle: "GameCube GBA dock",
  preview: {
    kind: "static",
    src: "/assets/wii/channels/disc/preview.png",
  },
  accent: "#5ab0ff",
  sounds: { enter: "disc-insert" },
  render: () => import("@/components/channels/DiscChannel"),
};

export default manifest;
