import { dsiAppDefinitionSchema, type DsiAppDefinition, type DsiAppId } from "./types";

export const dsiApps: ReadonlyArray<DsiAppDefinition> = [
  {
    id: "flick",
    label: "Flick",
    eyebrow: "Profile",
    description: "A scrapbook of the person behind the projects.",
    icon: "camera",
    accent: "#ff8d58",
    route: "/app/flick",
    status: "live",
  },
  {
    id: "projects",
    label: "Projects",
    eyebrow: "Work",
    description: "Experiments, interfaces, and other things worth opening.",
    icon: "present",
    accent: "#5f9bff",
    route: "/app/projects",
    status: "live",
  },
  {
    id: "mixtape",
    label: "Mixtape",
    eyebrow: "Sound",
    description: "A small playlist for making and thinking.",
    icon: "sound",
    accent: "#dd70ce",
    route: "/app/mixtape",
    status: "live",
  },
  {
    id: "media",
    label: "Media",
    eyebrow: "Broadcast",
    description: "Videos, clips, and places where the signal continues.",
    icon: "browser",
    accent: "#54b9aa",
    route: "/app/media",
    status: "live",
  },
  {
    id: "links",
    label: "Links",
    eyebrow: "Contact",
    description: "The useful doors: work history, profiles, and hello.",
    icon: "chat",
    accent: "#f0c35a",
    route: "/app/links",
    status: "live",
  },
  {
    id: "wii",
    label: "Wii Archive",
    eyebrow: "Legacy",
    description: "The older experiment, kept intact behind a side door.",
    icon: "wii",
    accent: "#80bce9",
    route: "/wii",
    status: "live",
  },
].map((app) => dsiAppDefinitionSchema.parse(app));

const byId = new Map(dsiApps.map((app) => [app.id, app]));

export function getDsiApp(id: string): DsiAppDefinition | undefined {
  return byId.get(id as DsiAppId);
}

export function getDsiAppIndex(id: DsiAppId): number {
  return Math.max(0, dsiApps.findIndex((app) => app.id === id));
}
