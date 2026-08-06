import { notFound } from "next/navigation";
import { DsiExperience } from "@/components/dsi/DsiExperience";
import { dsiApps } from "@/lib/dsi/registry";
import { dsiAppIdSchema, type DsiAppId } from "@/lib/dsi/types";

export function generateStaticParams() {
  return dsiApps.map((app) => ({ appId: app.id }));
}

export const dynamicParams = false;

export default async function DsiAppPage({
  params,
}: {
  params: Promise<{ appId: string }>;
}) {
  const { appId } = await params;
  const result = dsiAppIdSchema.safeParse(appId);
  if (!result.success) notFound();
  return <DsiExperience initialAppId={result.data as DsiAppId} />;
}
