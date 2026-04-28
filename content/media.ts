// Edit these IDs to surface your latest post per platform.
// Swap any of these for an ISR fetch later without touching the channel component.

export type MediaPlatform = "youtube" | "tiktok" | "tumblr";

export interface MediaEntry {
  platform: MediaPlatform;
  label: string;
  handle: string;
  profileUrl: string;
  latestUrl: string;
  embedUrl?: string;
}

export const media: MediaEntry[] = [
  {
    platform: "youtube",
    label: "YouTube",
    handle: "@flickowens",
    profileUrl: "https://youtube.com/@flickowens",
    latestUrl: "https://youtube.com/@flickowens",
  },
  {
    platform: "tiktok",
    label: "TikTok",
    handle: "@flick_owens",
    profileUrl: "https://www.tiktok.com/@flick_owens",
    latestUrl: "https://www.tiktok.com/@flick_owens",
  },
  {
    platform: "tumblr",
    label: "Tumblr",
    handle: "flickowens",
    profileUrl: "https://flickowens.tumblr.com",
    latestUrl: "https://flickowens.tumblr.com",
    embedUrl: "https://flickowens.tumblr.com",
  },
];
