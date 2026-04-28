"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { mii } from "@/content/mii";
import { getAudio } from "@/lib/audio/engine";

const poses = ["wave", "cheer", "think"] as const;
type Pose = (typeof poses)[number];

export default function MiiChannel() {
  const [pose, setPose] = useState<Pose>("wave");

  const cyclePose = () => {
    const i = poses.indexOf(pose);
    setPose(poses[(i + 1) % poses.length]);
    getAudio().play("mii-pose");
  };

  return (
    <div className="relative grid h-full grid-rows-[auto_1fr_auto] bg-[radial-gradient(ellipse_at_top,_#fdf3e6_0%,_#f6e2c2_60%,_#e7c89a_100%)] p-8">
      <div className="text-center">
        <div className="text-xs uppercase tracking-[0.3em] text-black/40">
          Mii Plaza
        </div>
        <div className="text-2xl font-semibold text-black/80">{mii.name}</div>
      </div>
      <div className="grid place-items-center">
        <MiiFigure pose={pose} />
      </div>
      <div className="flex flex-col items-center gap-4">
        <div className="rounded-full bg-white/70 px-5 py-2 text-sm italic text-black/70 shadow">
          &ldquo;{mii.quote}&rdquo;
        </div>
        <button
          data-wii-interactive
          onClick={cyclePose}
          className="rounded-full bg-[#3f7fc4] px-6 py-3 text-xs uppercase tracking-[0.25em] text-white shadow-lg hover:-translate-y-[1px]"
        >
          Change pose
        </button>
      </div>
    </div>
  );
}

function MiiFigure({ pose }: { pose: Pose }) {
  const armLeft = pose === "wave" ? -30 : pose === "cheer" ? -120 : -80;
  const armRight = pose === "wave" ? -80 : pose === "cheer" ? -120 : -40;

  return (
    <motion.svg
      width="240"
      height="320"
      viewBox="0 0 240 320"
      initial={false}
      animate={{ y: [0, -4, 0] }}
      transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
    >
      {/* shadow */}
      <ellipse cx="120" cy="304" rx="60" ry="8" fill="rgba(0,0,0,0.25)" />

      {/* body */}
      <rect x="80" y="170" width="80" height="100" rx="16" fill={mii.shirt} />

      {/* left arm */}
      <g style={{ transformOrigin: "82px 180px" }}>
        <motion.g animate={{ rotate: armLeft }} transition={{ type: "spring" }}>
          <rect x="62" y="175" width="22" height="70" rx="11" fill={mii.shirt} />
          <circle cx="73" cy="248" r="14" fill={mii.skin} stroke="#3b2a1a" strokeWidth="2" />
        </motion.g>
      </g>

      {/* right arm */}
      <g style={{ transformOrigin: "158px 180px" }}>
        <motion.g animate={{ rotate: armRight }} transition={{ type: "spring" }}>
          <rect x="156" y="175" width="22" height="70" rx="11" fill={mii.shirt} />
          <circle cx="167" cy="248" r="14" fill={mii.skin} stroke="#3b2a1a" strokeWidth="2" />
        </motion.g>
      </g>

      {/* head */}
      <circle cx="120" cy="100" r="70" fill={mii.skin} stroke="#3b2a1a" strokeWidth="3" />
      {/* hair */}
      <path
        d="M56 92 C62 42 178 42 184 92 C186 110 176 104 120 104 C64 104 54 110 56 92 Z"
        fill={mii.hair}
      />
      {/* eyes */}
      <circle cx="100" cy="100" r="6" fill={mii.eyes} />
      <circle cx="140" cy="100" r="6" fill={mii.eyes} />
      {/* mouth */}
      {pose === "think" ? (
        <line x1="108" y1="130" x2="132" y2="130" stroke="#1a1a1a" strokeWidth="3" strokeLinecap="round" />
      ) : (
        <path
          d="M100 128 Q120 146 140 128"
          stroke="#1a1a1a"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
      )}
    </motion.svg>
  );
}
