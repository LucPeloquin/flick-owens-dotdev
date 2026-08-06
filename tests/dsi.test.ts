import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { dsiContent } from "@/content/dsi";
import { clampDsiIndex, getDsiNavigationDelta, isDsiBackKey, isDsiLaunchKey } from "@/lib/dsi/navigation";
import { getDsiRouteState } from "@/lib/dsi/routes";
import { dsiApps } from "@/lib/dsi/registry";

describe("DSi carousel navigation", () => {
  it("clamps selection at both carousel boundaries", () => {
    expect(clampDsiIndex(-1, dsiApps.length)).toBe(0);
    expect(clampDsiIndex(999, dsiApps.length)).toBe(dsiApps.length - 1);
    expect(clampDsiIndex(5, 0)).toBe(0);
  });

  it("maps arrow keys and L/R jumps", () => {
    expect(getDsiNavigationDelta("ArrowLeft")).toBe(-1);
    expect(getDsiNavigationDelta("ArrowRight")).toBe(1);
    expect(getDsiNavigationDelta("l")).toBe(-2);
    expect(getDsiNavigationDelta("R")).toBe(2);
    expect(getDsiNavigationDelta("Enter")).toBe(0);
  });

  it("recognizes launch and back controls", () => {
    expect(isDsiLaunchKey("Enter")).toBe(true);
    expect(isDsiLaunchKey("A")).toBe(true);
    expect(isDsiBackKey("Escape")).toBe(true);
    expect(isDsiBackKey("b")).toBe(true);
  });
});

describe("DSi route and content contracts", () => {
  it("derives app and project state from the URL", () => {
    expect(getDsiRouteState("/app/projects/dsi-portfolio")).toEqual({
      appId: "projects",
      projectSlug: "dsi-portfolio",
    });
    expect(getDsiRouteState("/", "flick")).toEqual({ appId: "flick" });
  });

  it("keeps unfinished destinations visibly non-linkable", () => {
    expect(dsiContent.links.filter((link) => link.status === "coming-soon").every((link) => !link.href)).toBe(true);
    expect(dsiContent.playlist.find((track) => track.status === "coming-soon")?.src).toBeUndefined();
    expect(dsiContent.projects.some((project) => project.status === "coming-soon")).toBe(true);
  });

  it("keeps shipped asset hashes aligned with the manifest", () => {
    const root = path.resolve(import.meta.dirname, "..");
    const manifest = JSON.parse(readFileSync(path.join(root, "assets/dsi/sources.json"), "utf8")) as Array<{
      id: string;
      derivedPath: string;
      sha256: string;
    }>;
    for (const asset of manifest) {
      const digest = createHash("sha256")
        .update(readFileSync(path.join(root, asset.derivedPath)))
        .digest("hex");
      expect(digest, asset.id).toBe(asset.sha256);
    }
  });
});
