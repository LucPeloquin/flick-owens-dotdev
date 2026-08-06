import { notFound } from "next/navigation";
import { DsiExperience } from "@/components/dsi/DsiExperience";
import { projects } from "@/content/dsi";
import DsiPortfolioStudy from "@/content/projects/dsi-portfolio.mdx";
import MoreSoonStudy from "@/content/projects/more-soon.mdx";

const projectStudies = {
  "dsi-portfolio": DsiPortfolioStudy,
  "more-soon": MoreSoonStudy,
} as const;

export function generateStaticParams() {
  return projects.map((project) => ({ slug: project.slug }));
}

export const dynamicParams = false;

export default async function DsiProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!projects.some((project) => project.slug === slug)) notFound();
  const Study = projectStudies[slug as keyof typeof projectStudies];
  return (
    <DsiExperience
      initialAppId="projects"
      projectBody={
        <article className="dsi-mdx-content">
          <Study />
        </article>
      }
    />
  );
}
