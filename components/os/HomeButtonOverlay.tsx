"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useOS } from "@/lib/store/os";
import { getAudio } from "@/lib/audio/engine";

export function HomeButtonOverlay() {
  const open = useOS((s) => s.homeOverlayOpen);
  const closeHome = useOS((s) => s.closeHome);
  const toggleMuted = useOS((s) => s.toggleMuted);
  const muted = useOS((s) => s.muted);
  const router = useRouter();

  useEffect(() => {
    if (open) getAudio().play("home-open");
    else getAudio().play("home-close");
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") useOS.getState().openHome();
      if (e.key === "h" || e.key === "H") useOS.getState().openHome();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[9000] grid place-items-center bg-black/50 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="w-[480px] rounded-3xl border border-white/20 bg-gradient-to-b from-[#1f4e8a] to-[#0c2446] p-8 text-white shadow-2xl"
          >
            <div className="mb-6 text-center text-xl font-semibold tracking-wide">
              HOME Menu
            </div>
            <div className="grid grid-cols-1 gap-3">
              <HomeRow
                label="Resume"
                onClick={() => closeHome()}
                primary
              />
              <HomeRow
                label="Wii Menu"
                onClick={() => {
                  closeHome();
                  router.push("/");
                }}
              />
              <HomeRow
                label="Operations Guide"
                onClick={() => {
                  closeHome();
                  router.push("/settings");
                }}
              />
              <HomeRow
                label={muted ? "Unmute" : "Mute"}
                onClick={() => {
                  toggleMuted();
                  getAudio().setMuted(!muted);
                }}
              />
            </div>
            <div className="mt-6 text-center text-xs opacity-60">
              Press H or Esc to open this menu.
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function HomeRow({
  label,
  onClick,
  primary,
}: {
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      data-wii-interactive
      onClick={() => {
        getAudio().play("select");
        onClick();
      }}
      className={`w-full rounded-full px-6 py-3 text-left text-sm uppercase tracking-[0.2em] transition-transform hover:-translate-y-[1px] ${
        primary
          ? "bg-white text-[#0c2446]"
          : "border border-white/20 bg-white/5 hover:bg-white/10"
      }`}
    >
      {label}
    </button>
  );
}
