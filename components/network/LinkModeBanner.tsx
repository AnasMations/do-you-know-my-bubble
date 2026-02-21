"use client";

interface LinkModeBannerProps {
  nodeName: string;
  onCancel: () => void;
}

export function LinkModeBanner({ nodeName, onCancel }: LinkModeBannerProps) {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 px-4 py-2 bg-sky-100 dark:bg-sky-900/40 border border-sky-300 dark:border-sky-700 rounded-lg shadow flex items-center gap-3">
      <span className="text-sm text-sky-800 dark:text-sky-200">
        Click a node to connect to <strong>{nodeName}</strong>
      </span>
      <button
        type="button"
        onClick={onCancel}
        className="px-3 py-1 text-sm bg-sky-200 dark:bg-sky-800 hover:bg-sky-300 dark:hover:bg-sky-700 rounded transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}
