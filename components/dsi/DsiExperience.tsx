"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { dsiContent } from "@/content/dsi";
import { getAudio } from "@/lib/audio/engine";
import { clampDsiIndex, getDsiNavigationDelta, isDsiBackKey, isDsiLaunchKey } from "@/lib/dsi/navigation";
import { dsiApps, getDsiAppIndex } from "@/lib/dsi/registry";
import { getDsiRouteState } from "@/lib/dsi/routes";
import type { DsiAppId, DsiControlEventDetail } from "@/lib/dsi/types";
import { DsiIcon } from "./DsiIcon";

export function DsiExperience({
  initialAppId,
  projectBody,
}: {
  initialAppId: DsiAppId | null;
  projectBody?: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { appId: activeAppId, projectSlug } = getDsiRouteState(pathname, initialAppId);
  const activeApp = activeAppId
    ? dsiApps.find((app) => app.id === activeAppId)
    : undefined;
  const [selectedIndex, setSelectedIndex] = useState(() =>
    initialAppId ? getDsiAppIndex(initialAppId) : 0,
  );
  const selectedApp = dsiApps[selectedIndex] ?? dsiApps[0];

  const moveSelection = useCallback((delta: number) => {
    setSelectedIndex((current) => {
      const next = clampDsiIndex(current + delta, dsiApps.length);
      if (next !== current) getAudio().play("dsi-switch", { volume: 0.35 });
      return next;
    });
  }, []);

  const launchSelected = useCallback(() => {
    if (!selectedApp) return;
    getAudio().play("dsi-launch", { volume: 0.55 });
    if (selectedApp.id === "wii") {
      router.push("/app/wii");
      return;
    }
    router.push(selectedApp.route);
  }, [router, selectedApp]);

  const goHome = useCallback(() => {
    getAudio().play("dsi-back", { volume: 0.4 });
    router.push("/");
  }, [router]);

  useEffect(() => {
    const onControl = (event: Event) => {
      const detail = (event as CustomEvent<DsiControlEventDetail>).detail;
      if (activeAppId) {
        if (detail.control === "b") goHome();
        return;
      }

      switch (detail.control) {
        case "left":
          moveSelection(-1);
          break;
        case "right":
          moveSelection(1);
          break;
        case "a":
        case "start":
          launchSelected();
          break;
        case "b":
          goHome();
          break;
        case "select":
          moveSelection(1);
          break;
      }
    };

    window.addEventListener("dsi-control", onControl);
    return () => window.removeEventListener("dsi-control", onControl);
  }, [activeAppId, goHome, launchSelected, moveSelection]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, a")) return;

      if (activeAppId) {
        if (isDsiBackKey(event.key)) {
          event.preventDefault();
          goHome();
        }
        return;
      }

      const navigationDelta = getDsiNavigationDelta(event.key);
      if (navigationDelta !== 0) {
        event.preventDefault();
        moveSelection(navigationDelta);
      } else if (isDsiLaunchKey(event.key)) {
        event.preventDefault();
        launchSelected();
      } else if (isDsiBackKey(event.key)) {
        event.preventDefault();
        goHome();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeAppId, goHome, launchSelected, moveSelection]);

  if (activeApp) {
    return <DsiAppScreens appId={activeApp.id} projectSlug={projectSlug} projectBody={projectBody} />;
  }

  return (
    <DsiMenu
      selectedIndex={selectedIndex}
      selectedApp={selectedApp}
      onSelect={setSelectedIndex}
      onLaunch={launchSelected}
      onMove={moveSelection}
    />
  );
}

function DsiMenu({
  selectedIndex,
  selectedApp,
  onSelect,
  onLaunch,
  onMove,
}: {
  selectedIndex: number;
  selectedApp: (typeof dsiApps)[number];
  onSelect: (index: number) => void;
  onLaunch: () => void;
  onMove: (delta: number) => void;
}) {
  const [time, setTime] = useState("--:--");
  const selectedTileRef = useRef<HTMLButtonElement>(null);
  const touchStart = useRef<number | null>(null);

  useEffect(() => {
    const update = () =>
      setTime(
        new Intl.DateTimeFormat(undefined, {
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date()),
      );
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    selectedTileRef.current?.focus({ preventScroll: true });
  }, [selectedIndex]);

  return (
    <div className="dsi-screen-layout" aria-label="DSi portfolio menu">
      <section className="dsi-screen dsi-top-screen" aria-label="Top screen">
        <div className="dsi-status-row">
          <span>FLICK OWENS</span>
          <span>{time}</span>
          <span className="dsi-status-battery">▰▰▰</span>
        </div>
        <div className="dsi-top-preview" style={{ "--preview-accent": selectedApp.accent } as React.CSSProperties}>
          <div className="dsi-top-preview-photo" aria-hidden="true">
            <div className="dsi-photo-mark">F</div>
            <span>PHOTO SLOT</span>
          </div>
          <div className="dsi-top-preview-copy">
            <span className="dsi-screen-eyebrow">{selectedApp.eyebrow}</span>
            <h1>{selectedApp.label}</h1>
            <p>{selectedApp.description}</p>
            <div className="dsi-preview-rule" />
            <span className="dsi-preview-hint">A / TOUCH TO OPEN</span>
          </div>
        </div>
        <div className="dsi-top-footnote">PERSONAL DEVICE / 01</div>
      </section>

      <section
        className="dsi-screen dsi-bottom-screen"
        aria-label="Touch screen application menu"
        onWheel={(event) => {
          event.preventDefault();
          onMove(event.deltaY > 0 ? 1 : -1);
        }}
        onPointerDown={(event) => {
          touchStart.current = event.clientX;
        }}
        onPointerUp={(event) => {
          if (touchStart.current == null) return;
          const delta = event.clientX - touchStart.current;
          if (Math.abs(delta) > 18) onMove(delta < 0 ? 1 : -1);
          touchStart.current = null;
        }}
      >
        <div className="dsi-menu-label-row" aria-live="polite">
          <span>SELECT AN APP</span>
          <span>{selectedIndex + 1} / {dsiApps.length}</span>
          <span className="sr-only">Selected app: {selectedApp.label}</span>
        </div>
        <div className="dsi-carousel-viewport">
          <div className="dsi-carousel" style={{ transform: `translateX(-${selectedIndex * 92 + 42}px)` }}>
            {dsiApps.map((app, index) => (
              <button
                key={app.id}
                ref={index === selectedIndex ? selectedTileRef : undefined}
                type="button"
                aria-label={`${app.label}: ${app.description}`}
                aria-current={index === selectedIndex ? "true" : undefined}
                className={`dsi-app-tile ${index === selectedIndex ? "is-selected" : ""}`}
                onClick={() => {
                  if (index === selectedIndex) onLaunch();
                  else {
                    onSelect(index);
                    getAudio().play("dsi-switch", { volume: 0.35 });
                  }
                }}
                onDoubleClick={onLaunch}
              >
                <span className="dsi-tile-icon"><DsiIcon app={app} size={58} /></span>
                <span className="dsi-tile-label">{app.label}</span>
              </button>
            ))}
          </div>
        </div>
        <button type="button" className="dsi-start-button" onClick={onLaunch}>
          <span>START</span>
        </button>
        <div className="dsi-touch-help">DRAG / SWIPE / D-PAD</div>
      </section>
    </div>
  );
}

function DsiAppScreens({
  appId,
  projectSlug,
  projectBody,
}: {
  appId: DsiAppId;
  projectSlug?: string;
  projectBody?: ReactNode;
}) {
  const app = dsiApps.find((entry) => entry.id === appId) ?? dsiApps[0];
  return (
    <div className="dsi-screen-layout dsi-app-layout" aria-label={`${app.label} application`}>
      <section className="dsi-screen dsi-top-screen" aria-label="Top screen">
        <DsiTopApp appId={appId} projectSlug={projectSlug} />
      </section>
      <section className="dsi-screen dsi-bottom-screen" aria-label="Touch screen">
        <DsiBottomApp appId={appId} projectSlug={projectSlug} projectBody={projectBody} />
      </section>
    </div>
  );
}

function DsiTopApp({ appId, projectSlug }: { appId: DsiAppId; projectSlug?: string }) {
  const project = dsiContent.projects.find((item) => item.slug === projectSlug) ?? dsiContent.projects[0];
  if (appId === "wii") {
    return (
      <div className="dsi-app-top dsi-app-top-wii">
        <span className="dsi-screen-eyebrow">LEGACY SIGNAL / ARCHIVE</span>
        <h1>Wii Workshop</h1>
        <p>The first experiment stays intact: channels, music, and a little blue-screen nostalgia.</p>
        <div className="dsi-top-terminal">ARCHIVE BRANCH / READY TO VISIT</div>
      </div>
    );
  }

  if (appId === "projects") {
    return (
      <div className="dsi-app-top dsi-app-top-projects">
        <span className="dsi-screen-eyebrow">{project.eyebrow}</span>
        <h1>{project.title}</h1>
        <p>{project.summary}</p>
        <div className="dsi-project-stats"><span>{project.year}</span>{project.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
        <div className="dsi-top-terminal">CASE STUDY BUFFER / {project.status === "live" ? "READY" : "EMPTY SLOT"}</div>
      </div>
    );
  }

  if (appId === "mixtape") {
    return (
      <div className="dsi-app-top dsi-app-top-mixtape">
        <span className="dsi-screen-eyebrow">NOW PLAYING</span>
        <div className="dsi-record" aria-hidden="true"><span>F</span></div>
        <h1>Menu signal</h1>
        <p>Flick’s desk / 02:18</p>
        <div className="dsi-waveform" aria-hidden="true">▂▅▃▆▇▃▅▂▆▃▅▇▂▅▃</div>
      </div>
    );
  }

  if (appId === "media") {
    return (
      <div className="dsi-app-top dsi-app-top-media">
        <span className="dsi-screen-eyebrow">SIGNAL ONLINE</span>
        <div className="dsi-media-preview"><span>SELECT A PLATFORM BELOW</span></div>
        <h1>Media shelf</h1>
        <p>Open an external channel when you are ready to leave the device.</p>
      </div>
    );
  }

  if (appId === "links") {
    return (
      <div className="dsi-app-top dsi-app-top-links">
        <span className="dsi-screen-eyebrow">CONTACT CARD</span>
        <div className="dsi-contact-mark">FO</div>
        <h1>Keep in touch.</h1>
        <p>Professional links are loading into the next build.</p>
        <div className="dsi-top-terminal">STATUS / OPEN TO GOOD QUESTIONS</div>
      </div>
    );
  }

  return (
    <div className="dsi-app-top dsi-app-top-flick">
      <span className="dsi-screen-eyebrow">FLICK OWENS / PROFILE</span>
      <h1>Builder, collector, signal hunter.</h1>
      <p>I like interfaces that feel like places, and projects with a little mischief in the wiring.</p>
      <div className="dsi-scrap-row"><span>INTERACTION</span><span>MEDIA</span><span>PLAY</span></div>
    </div>
  );
}

function DsiBottomApp({
  appId,
  projectSlug,
  projectBody,
}: {
  appId: DsiAppId;
  projectSlug?: string;
  projectBody?: ReactNode;
}) {
  const router = useRouter();
  const [playing, setPlaying] = useState(false);
  const project = dsiContent.projects.find((item) => item.slug === projectSlug) ?? dsiContent.projects[0];

  if (appId === "wii") {
    return (
      <div className="dsi-app-bottom">
        <div className="dsi-menu-label-row"><span>WII ARCHIVE</span><span>LEGACY BRANCH</span></div>
        <div className="dsi-archive-card">
          <span className="dsi-archive-mark">WII</span>
          <p>Open the preserved Wii menu in its own route. Its music, channels, and emulator-era assets stay out of this device until you choose to launch it.</p>
          <button type="button" className="dsi-list-card" onClick={() => router.push("/wii")}>
            <span className="dsi-list-index">A</span>
            <span><strong>Launch Wii Archive</strong><small>/wii · legacy namespace</small></span>
            <span className="dsi-list-arrow">›</span>
          </button>
        </div>
        <div className="dsi-app-hint">B / MENU &nbsp; · &nbsp; ARCHIVE OPENS SEPARATELY</div>
      </div>
    );
  }

  if (appId === "projects") {
    return (
      <div className="dsi-app-bottom">
        <div className="dsi-menu-label-row"><span>PROJECT SLOTS</span><span>{dsiContent.projects.length} ITEMS</span></div>
        <div className="dsi-project-list">
          {dsiContent.projects.map((item) => (
            <button key={item.slug} type="button" className={`dsi-list-card ${item.slug === project.slug ? "is-active" : ""}`} onClick={() => router.push(`/app/projects/${item.slug}`)}>
              <span className="dsi-list-index">{item.status === "live" ? "01" : "—"}</span>
              <span><strong>{item.title}</strong><small>{item.eyebrow} · {item.year}</small></span>
              <span className="dsi-list-arrow">›</span>
            </button>
          ))}
        </div>
        {projectBody && (
          <details className="dsi-project-study">
            <summary>CASE STUDY NOTES</summary>
            <div className="dsi-project-study-copy">{projectBody}</div>
          </details>
        )}
        <div className="dsi-app-hint">B / MENU &nbsp; · &nbsp; TAP A SLOT</div>
      </div>
    );
  }

  if (appId === "mixtape") {
    return (
      <div className="dsi-app-bottom">
        <div className="dsi-menu-label-row"><span>PLAYLIST</span><span>01 / 02</span></div>
        <div className="dsi-track-list">
          {dsiContent.playlist.map((track, index) => (
            <button key={track.id} type="button" disabled={track.status !== "live"} className={`dsi-track ${index === 0 ? "is-active" : ""}`} onClick={() => {
              if (track.src) {
                const audio = getAudio();
                audio.unlock();
                audio.setBgm("dsi-menu", { loop: true, volume: 0.18 });
                setPlaying(true);
              }
            }}>
              <span>{index === 0 && playing ? "Ⅱ" : "▶"}</span><span>{track.title}</span><small>{track.duration}</small>
            </button>
          ))}
        </div>
        <div className="dsi-app-hint">A / {playing ? "PLAYING" : "PLAY"} &nbsp; · &nbsp; B / MENU</div>
      </div>
    );
  }

  if (appId === "media") {
    return (
      <div className="dsi-app-bottom">
        <div className="dsi-menu-label-row"><span>CHANNELS</span><span>EXTERNAL LINKS</span></div>
        <div className="dsi-media-list">
          {dsiContent.media.map((item) => (
            <a key={item.id} href={item.href} target="_blank" rel="noreferrer" className="dsi-list-card">
              <span className="dsi-list-platform">{item.platform.slice(0, 2).toUpperCase()}</span>
              <span><strong>{item.label}</strong><small>{item.description}</small></span><span className="dsi-list-arrow">↗</span>
            </a>
          ))}
        </div>
        <div className="dsi-app-hint">LINKS OPEN IN A NEW TAB</div>
      </div>
    );
  }

  if (appId === "links") {
    return (
      <div className="dsi-app-bottom">
        <div className="dsi-menu-label-row"><span>ADDRESS BOOK</span><span>COMING ONLINE</span></div>
        <div className="dsi-link-list">
          {dsiContent.links.map((link) => {
            const content = <><span className="dsi-link-kind">{link.kind.slice(0, 2).toUpperCase()}</span><span><strong>{link.label}</strong><small>{link.status === "live" ? link.description : "Coming soon"}</small></span><span className="dsi-list-arrow">{link.status === "live" ? "↗" : "…"}</span></>;
            return link.href ? <a key={link.id} href={link.href} target="_blank" rel="noreferrer" className="dsi-list-card">{content}</a> : <div key={link.id} className="dsi-list-card is-disabled" aria-disabled="true">{content}</div>;
          })}
        </div>
        <div className="dsi-app-hint">THE NEXT SLOT IS YOURS</div>
      </div>
    );
  }

  return (
    <div className="dsi-app-bottom dsi-flick-bottom">
      <div className="dsi-menu-label-row"><span>ABOUT FLICK</span><span>PROFILE 01</span></div>
      <div className="dsi-fact-grid">
        <div><small>LIKES</small><strong>odd hardware</strong></div>
        <div><small>MAKES</small><strong>playful systems</strong></div>
        <div><small>LOOKING FOR</small><strong>good collaborators</strong></div>
        <div><small>CURRENT MOOD</small><strong>loading ideas</strong></div>
      </div>
      <div className="dsi-app-hint">B / MENU &nbsp; · &nbsp; SCROLL THE DEVICE</div>
    </div>
  );
}
