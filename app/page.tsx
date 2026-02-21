"use client";

import Image from "next/image";
import useSound from "use-sound";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [playBubbleSound] = useSound("/sounds/bubble.mp3");

  const handleBubbleClick = () => {
    playBubbleSound();
    router.push("/network");
  };
  return (
    <div className="flex flex-col min-h-screen items-center justify-center bg-gradient-to-b from-sky-100 via-sky-50 to-white relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-10 left-[10%] w-64 h-64 bg-sky-200/40 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-[15%] w-80 h-80 bg-cyan-200/30 rounded-full blur-3xl" />
        <div className="absolute top-1/3 right-[10%] w-48 h-48 bg-sky-300/20 rounded-full blur-2xl" />
      </div>
      <div className="relative z-10 flex flex-col items-center text-center px-6">
        <h1 className="text-5xl font-bold text-sky-900 tracking-tight">
          Do You Know My Bubble?
        </h1>
        <p className="text-lg text-sky-600 mt-3 max-w-md">
          Do You Know My Bubble -
        </p>
        <button
          onClick={handleBubbleClick}
          className="mt-16 cursor-pointer hover:scale-110 transition-transform"
          aria-label="Enter your bubble"
        >
          <Image className="animate-bounce drop-shadow-[0_8px_24px_rgba(14,165,233,0.3)]" src="/bubble.png" alt="Bubble" width={100} height={100} />
        </button>
        <p className="mt-6 text-sm text-sky-400 animate-pulse">
          Click the bubble to start
        </p>
      </div>
    </div>
  );
}
