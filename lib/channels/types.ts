import { z } from "zod";
import type { ComponentType } from "react";

export const channelPreviewSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("static"),
    src: z.string(),
    label: z.string().optional(),
  }),
  z.object({
    kind: z.literal("video"),
    src: z.string(),
    label: z.string().optional(),
  }),
  z.object({
    kind: z.literal("color"),
    color: z.string(),
    icon: z.string().optional(),
    label: z.string().optional(),
  }),
]);

export const channelManifestMetaSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  slot: z.number().int().min(0).max(11),
  title: z.string(),
  subtitle: z.string().optional(),
  preview: channelPreviewSchema,
  accent: z.string().optional(),
  sounds: z
    .object({
      enter: z.string().optional(),
      ambient: z.string().optional(),
    })
    .optional(),
});

export type ChannelPreview = z.infer<typeof channelPreviewSchema>;
export type ChannelManifestMeta = z.infer<typeof channelManifestMetaSchema>;

export interface ChannelManifest extends ChannelManifestMeta {
  render: () => Promise<{ default: ComponentType }>;
}

export const TOTAL_SLOTS = 12;
