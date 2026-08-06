import { z } from "zod";

export const dsiAppIdSchema = z.enum([
  "flick",
  "projects",
  "mixtape",
  "media",
  "links",
  "wii",
]);

export type DsiAppId = z.infer<typeof dsiAppIdSchema>;

export const dsiAssetRecordSchema = z.object({
  id: z.string(),
  category: z.enum(["chrome", "icon", "font", "audio", "model"]),
  source: z.string().url(),
  revision: z.string().optional(),
  originalFile: z.string(),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  derivedPath: z.string(),
  transform: z.string().optional(),
});

export type DsiAssetRecord = z.infer<typeof dsiAssetRecordSchema>;

export const portfolioLinkSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  href: z.string().url().optional(),
  status: z.enum(["live", "coming-soon"]),
  kind: z.enum(["github", "linkedin", "resume", "email", "social", "other"]),
});

export type PortfolioLink = z.infer<typeof portfolioLinkSchema>;

export const playlistTrackSchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string(),
  duration: z.string(),
  src: z.string().optional(),
  status: z.enum(["live", "coming-soon"]),
});

export type PlaylistTrack = z.infer<typeof playlistTrackSchema>;

export const mediaItemSchema = z.object({
  id: z.string(),
  platform: z.enum(["youtube", "tiktok", "tumblr"]),
  label: z.string(),
  description: z.string(),
  href: z.string().url(),
  embed: z.string().url().optional(),
});

export type MediaItem = z.infer<typeof mediaItemSchema>;

export const portfolioProjectMetaSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string(),
  eyebrow: z.string(),
  summary: z.string(),
  year: z.string(),
  tags: z.array(z.string()),
  status: z.enum(["live", "coming-soon"]),
  href: z.string().url().optional(),
});

export type PortfolioProjectMeta = z.infer<typeof portfolioProjectMetaSchema>;

export const dsiAppDefinitionSchema = z.object({
  id: dsiAppIdSchema,
  label: z.string(),
  eyebrow: z.string(),
  description: z.string(),
  icon: z.enum(["camera", "present", "sound", "browser", "chat", "wii"]),
  accent: z.string().regex(/^#[0-9a-f]{6}$/i),
  route: z.string().startsWith("/"),
  status: z.enum(["live", "coming-soon"]),
});

export type DsiAppDefinition = z.infer<typeof dsiAppDefinitionSchema>;

export interface DsiControlEventDetail {
  control: "left" | "right" | "up" | "down" | "a" | "b" | "start" | "select";
}
