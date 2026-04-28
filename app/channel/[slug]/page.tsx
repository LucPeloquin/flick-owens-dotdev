import { notFound } from "next/navigation";
import dynamic from "next/dynamic";
import { getChannelBySlug, channels } from "@/lib/channels/registry";
import { ChannelFrame } from "@/components/os/ChannelFrame";

export function generateStaticParams() {
  return channels.map((c) => ({ slug: c.slug }));
}

export default async function ChannelPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const channel = getChannelBySlug(slug);
  if (!channel) notFound();

  const ChannelBody = dynamic(() => channel.render());
  const { render: _render, ...meta } = channel;
  void _render;

  return (
    <ChannelFrame channel={meta}>
      <ChannelBody />
    </ChannelFrame>
  );
}
