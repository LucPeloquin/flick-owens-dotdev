import { channelManifestMetaSchema, TOTAL_SLOTS, type ChannelManifest } from "./types";
import disc from "./manifests/disc";
import mii from "./manifests/mii";
import mp3 from "./manifests/mp3";
import media from "./manifests/media";

const rawChannels: ChannelManifest[] = [disc, mii, mp3, media];

for (const c of rawChannels) {
  channelManifestMetaSchema.parse({
    slug: c.slug,
    slot: c.slot,
    title: c.title,
    subtitle: c.subtitle,
    preview: c.preview,
    accent: c.accent,
    sounds: c.sounds,
  });
}

const bySlug = new Map(rawChannels.map((c) => [c.slug, c]));
const bySlot = new Map(rawChannels.map((c) => [c.slot, c]));

if (bySlug.size !== rawChannels.length) {
  throw new Error("Duplicate channel slug in registry");
}
if (bySlot.size !== rawChannels.length) {
  throw new Error("Duplicate channel slot in registry");
}

export const channels: ReadonlyArray<ChannelManifest> = rawChannels;

export function getChannelBySlug(slug: string): ChannelManifest | undefined {
  return bySlug.get(slug);
}

export function getChannelBySlot(slot: number): ChannelManifest | undefined {
  return bySlot.get(slot);
}

export function allSlots(): Array<ChannelManifest | undefined> {
  return Array.from({ length: TOTAL_SLOTS }, (_, i) => bySlot.get(i));
}
