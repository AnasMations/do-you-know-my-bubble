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
    <div className="flex flex-col min-h-screen items-center justify-center">
      <h1 className="text-4xl font-bold">Do You Know My Bubble?</h1>
      <p className="text-lg">Earth is a small village, get to explore the bubbles with your friends</p>
      <button
        onClick={handleBubbleClick}
        className="mt-16 cursor-pointer hover:scale-110 transition-transform"
        aria-label="Enter your bubble"
      >
        <Image className="animate-bounce" src="/bubble.png" alt="Bubble" width={100} height={100} />
      </button>
    </div>
  );
}
