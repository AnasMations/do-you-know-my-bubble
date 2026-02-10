import Image from "next/image";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen items-center justify-center">
      <h1 className="text-4xl font-bold">Do You Know My Bubble?</h1>
      <p className="text-lg">Earth is a small village, get to explore the bubbles with your friends</p>
      <Image className="mt-16 animate-bounce" src="/bubble.png" alt="Bubble" width={100} height={100} />
    </div>
  );
}
