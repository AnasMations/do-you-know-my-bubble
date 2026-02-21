"use client";

interface GroupModeBannerProps {
  groupName: string;
  onDone: () => void;
}

export function GroupModeBanner({ groupName, onDone }: GroupModeBannerProps) {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 px-4 py-2 bg-violet-100 dark:bg-violet-900/40 border border-violet-300 dark:border-violet-700 rounded-lg shadow flex items-center gap-3">
      <span className="text-sm text-violet-800 dark:text-violet-200">
        Click nodes to add them to <strong>{groupName}</strong>
      </span>
      <button
        type="button"
        onClick={onDone}
        className="px-3 py-1 text-sm bg-violet-200 dark:bg-violet-800 hover:bg-violet-300 dark:hover:bg-violet-700 rounded transition-colors"
      >
        Done
      </button>
    </div>
  );
}
