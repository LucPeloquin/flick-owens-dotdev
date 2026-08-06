import dynamic from "next/dynamic";
import { notFound } from "next/navigation";
import { ChannelFrame } from "@/components/os/ChannelFrame";
import { channels, getChannelBySlug } from "@/lib/channels/registry";

const channelBodies = {
  disc: dynamic(() => import("@/components/channels/DiscChannel")),
  mii: dynamic(() => import("@/components/channels/MiiChannel")),
  mp3: dynamic(() => import("@/components/channels/MP3Channel")),
  media: dynamic(() => import("@/components/channels/MediaChannel")),
};

export function generateStaticParams() {
  return channels.map((channel) => ({ slug: channel.slug }));
}

export const dynamicParams = false;

export default async function WiiChannelPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const channel = getChannelBySlug(slug);
  if (!channel) notFound();

  const ChannelBody = channelBodies[channel.slug as keyof typeof channelBodies];
  if (!ChannelBody) notFound();

  const { render: _render, ...meta } = channel;
  void _render;

  return (
    <ChannelFrame channel={meta}>
      <ChannelBody />
    </ChannelFrame>
  );
}
