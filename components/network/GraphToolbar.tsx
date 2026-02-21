"use client";

interface GraphToolbarProps {
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  isFrozen: boolean;
  onFreeze: () => void;
  onUnfreeze: () => void;
  showAddGroupForm: boolean;
  onToggleGroupForm: (show: boolean) => void;
  newGroupName: string;
  onGroupNameChange: (name: string) => void;
  onAddGroup: (e: React.FormEvent) => void;
}

export function GraphToolbar({
  isFullscreen,
  onToggleFullscreen,
  isFrozen,
  onFreeze,
  onUnfreeze,
  showAddGroupForm,
  onToggleGroupForm,
  newGroupName,
  onGroupNameChange,
  onAddGroup,
}: GraphToolbarProps) {
  return (
    <div
      className="absolute top-3 right-3 z-20 flex flex-col gap-2 p-2 rounded-xl bg-white/90 shadow-lg border border-sky-200"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={onToggleFullscreen}
        className="px-4 py-2 bg-sky-800 hover:bg-sky-900 text-white font-medium rounded-lg transition-colors text-sm whitespace-nowrap"
      >
        {isFullscreen ? "Exit full screen" : "Full screen"}
      </button>
      <button
        type="button"
        onClick={onFreeze}
        disabled={isFrozen}
        className="px-4 py-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-sm whitespace-nowrap"
      >
        Freeze layout
      </button>
      <button
        type="button"
        onClick={onUnfreeze}
        disabled={!isFrozen}
        className="px-4 py-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-sm whitespace-nowrap"
      >
        Unfreeze layout
      </button>
      {showAddGroupForm ? (
        <form onSubmit={onAddGroup} className="flex flex-col gap-2">
          <input
            type="text"
            value={newGroupName}
            onChange={(e) => onGroupNameChange(e.target.value)}
            placeholder="Group name (e.g. Family, Work)"
            className="px-3 py-2 border border-sky-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white text-sky-900 placeholder:text-sky-300 text-sm w-40"
            autoFocus
          />
          <div className="flex gap-1">
            <button
              type="submit"
              className="flex-1 px-3 py-2 bg-sky-500 hover:bg-sky-600 text-white font-medium rounded-lg transition-colors text-sm"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                onToggleGroupForm(false);
                onGroupNameChange("");
              }}
              className="px-3 py-2 text-sm text-sky-600 hover:bg-sky-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => onToggleGroupForm(true)}
          className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white font-medium rounded-lg transition-colors text-sm whitespace-nowrap"
        >
          Add group
        </button>
      )}
    </div>
  );
}
