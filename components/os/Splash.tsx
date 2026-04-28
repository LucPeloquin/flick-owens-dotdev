"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
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
            className="group flex w-full max-w-[680px] cursor-none flex-col items-center px-8 text-center"
            onClick={() => {
              const audio = getAudio();
              audio.unlock();
              audio.play("select");
              audio.setBgm("menu", { loop: true });
              boot();
            }}
          >
            <Image
              src="/assets/wii/ui/health-safety-warning.png"
              alt="Warning - Health and Safety"
              width={608}
              height={552}
              className="w-full max-w-[608px]"
              draggable={false}
            />
            <Image
              src="/assets/wii/ui/health-safety-prompt.png"
              alt="Press A to continue."
              width={608}
              height={65}
              className="mt-3 w-full max-w-[420px] transition-opacity group-hover:opacity-75"
              draggable={false}
            />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
