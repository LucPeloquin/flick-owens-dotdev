import {
  mediaItemSchema,
  playlistTrackSchema,
  portfolioLinkSchema,
  portfolioProjectMetaSchema,
  type MediaItem,
  type PlaylistTrack,
  type PortfolioLink,
  type PortfolioProjectMeta,
} from "@/lib/dsi/types";

export const projects: PortfolioProjectMeta[] = [
  portfolioProjectMetaSchema.parse({
    slug: "dsi-portfolio",
    title: "DSi portfolio",
    eyebrow: "Current build",
    summary: "A physical console interface for the work, references, and rabbit holes behind this site.",
    year: "2026",
    tags: ["Next.js", "WebGL", "interaction"],
    status: "live",
  }),
  portfolioProjectMetaSchema.parse({
    slug: "more-soon",
    title: "More to load",
    eyebrow: "Archive slot",
    summary: "A future case study will live here once the project notes are ready.",
    year: "—",
    tags: ["coming soon"],
    status: "coming-soon",
  }),
];

export const links: PortfolioLink[] = [
  portfolioLinkSchema.parse({
    id: "github",
    label: "GitHub",
    description: "Code, experiments, and the workbench.",
    kind: "github",
    status: "coming-soon",
  }),
  portfolioLinkSchema.parse({
    id: "linkedin",
    label: "LinkedIn",
    description: "Professional profile and work history.",
    kind: "linkedin",
    status: "coming-soon",
  }),
  portfolioLinkSchema.parse({
    id: "resume",
    label: "Résumé",
    description: "A downloadable one-page version of the signal.",
    kind: "resume",
    status: "coming-soon",
  }),
  portfolioLinkSchema.parse({
    id: "email",
    label: "Say hello",
    description: "A direct line for a good project or a strange idea.",
    kind: "email",
    status: "coming-soon",
  }),
];

export const playlist: PlaylistTrack[] = [
  playlistTrackSchema.parse({
    id: "menu-signal",
    title: "Menu signal",
    artist: "Flick’s desk",
    duration: "02:18",
    status: "live",
    src: "/sounds/dsi/menu.m4a",
  }),
  playlistTrackSchema.parse({
    id: "next-slot",
    title: "Next slot",
    artist: "Coming soon",
    duration: "—:—",
    status: "coming-soon",
  }),
];

export const media: MediaItem[] = [
  mediaItemSchema.parse({
    id: "youtube",
    platform: "youtube",
    label: "YouTube",
    description: "Longer videos and channel experiments.",
    href: "https://youtube.com/@flickowens",
  }),
  mediaItemSchema.parse({
    id: "tiktok",
    platform: "tiktok",
    label: "TikTok",
    description: "Short-form fragments and quick signals.",
    href: "https://www.tiktok.com/@flick_owens",
  }),
  mediaItemSchema.parse({
    id: "tumblr",
    platform: "tumblr",
    label: "Tumblr",
    description: "A looser notebook of references and images.",
    href: "https://flickowens.tumblr.com",
  }),
];

export const dsiContent = {
  projects,
  links,
  playlist,
  media,
} satisfies {
  projects: PortfolioProjectMeta[];
  links: PortfolioLink[];
  playlist: PlaylistTrack[];
  media: MediaItem[];
};
