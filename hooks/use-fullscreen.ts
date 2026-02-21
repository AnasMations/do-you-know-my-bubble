"use client";

import { useState, useEffect, useCallback, type RefObject } from "react";

export function useFullscreen(
  containerRef: RefObject<HTMLDivElement | null>
) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (isFullscreen) {
      await document.exitFullscreen();
    } else {
      await containerRef.current?.requestFullscreen();
    }
  }, [isFullscreen, containerRef]);

  return { isFullscreen, toggleFullscreen };
}
