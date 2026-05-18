import { useState, useEffect } from "react";
import logoUrl from "../assets/beggarclub_logo.svg?url";

export default function SplashScreen({ onDone }: { onDone: () => void }) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setFading(true), 3000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center transition-opacity duration-1000 ease-out"
      style={{ background: "#F7F8F9", opacity: fading ? 0 : 1, pointerEvents: fading ? "none" : "all" }}
      onTransitionEnd={() => { if (fading) onDone(); }}
    >
      <img
        src={logoUrl}
        alt="BeggarClub"
        className="select-none"
        style={{ width: "1000px", maxWidth: "90vw" }}
        draggable={false}
      />
    </div>
  );
}
