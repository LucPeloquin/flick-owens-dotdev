"use client";

import Image from "next/image";

export function WiiWorkshopScene() {
  return (
    <div className="wii-workshop-scene" aria-hidden>
      <div className="wii-workshop-linepattern" />
      <div className="wii-workshop-frame" />
      <div className="wii-workshop-disc">
        <Image
          src="/assets/wii/workshop/disc.png"
          alt=""
          width={84}
          height={84}
          draggable={false}
        />
      </div>
      <div className="wii-workshop-circle wii-workshop-circle-left" />
      <div className="wii-workshop-circle wii-workshop-circle-right" />
    </div>
  );
}
