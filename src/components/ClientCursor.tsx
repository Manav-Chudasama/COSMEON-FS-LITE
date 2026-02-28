"use client";

import dynamic from "next/dynamic";

const TargetCursor = dynamic(() => import("./TargetCursor"), { ssr: false });

export default function ClientCursor() {
  return (
    <TargetCursor
      spinDuration={2}
      hideDefaultCursor
      parallaxOn
      hoverDuration={0.2}
    />
  );
}
