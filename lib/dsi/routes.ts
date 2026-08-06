import { dsiAppIdSchema, type DsiAppId } from "./types";

export interface DsiRouteState {
  appId: DsiAppId | null;
  projectSlug?: string;
}

export function getDsiRouteState(pathname: string, fallback: DsiAppId | null = null): DsiRouteState {
  const appMatch = pathname.match(/^\/app\/([^/]+)/);
  const parsed = appMatch ? dsiAppIdSchema.safeParse(appMatch[1]) : null;
  return {
    appId: parsed?.success ? parsed.data : fallback,
    projectSlug: pathname.match(/^\/app\/projects\/([^/]+)/)?.[1],
  };
}
