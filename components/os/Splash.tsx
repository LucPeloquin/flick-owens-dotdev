"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useOS } from "@/lib/store/os";
import { getAudio } from "@/lib/audio/engine";

export function Splash() {
  const booted = useOS((s) => s.booted);
  const boot = useOS((s) => s.boot);

  return (
    <AnimatePresence>
      {!booted && (
        <motion.div
          key="splash"
          className="fixed inset-0 z-[9500] grid place-items-center bg-black text-white"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
        >
          <button
            data-wii-interactive
            className="group flex max-w-lg cursor-none flex-col items-center px-8 text-center"
            onClick={() => {
              const audio = getAudio();
              audio.unlock();
              audio.play("select");
              audio.setBgm("menu", { loop: true });
              boot();
            }}
          >
            <div className="mb-4 text-xs uppercase tracking-[0.5em] text-white/60">
              Health &amp; Safety
            </div>
            <h1 className="text-4xl font-light leading-tight">
              Please ensure the wrist strap is securely attached before use.
            </h1>
            <p className="mt-6 max-w-md text-sm text-white/70">
              Playing with a Wii Remote without the wrist strap can cause injury
              to yourself or others and/or damage to your television and
              surrounding objects.
            </p>
            <div className="mt-10 inline-flex items-center gap-3 rounded-full border border-white/40 px-6 py-3 text-sm uppercase tracking-[0.3em] transition-colors group-hover:bg-white group-hover:text-black">
              Click to continue
            </div>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
