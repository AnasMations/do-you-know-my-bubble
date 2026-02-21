"use client";

import type { NodeData, BubbleGroup } from "@/types/network";

interface NodePopupProps {
  node: NodeData;
  position: { x: number; y: number };
  newConnectionName: string;
  onConnectionNameChange: (name: string) => void;
  onAddConnection: (e: React.FormEvent) => void;
  groups: BubbleGroup[];
  onAddToGroup: (groupId: string) => void;
  onRemoveFromGroup: (groupId: string) => void;
  onConnectToNode: () => void;
  onClose: () => void;
}

export default function NodePopup({
  node,
  position,
  newConnectionName,
  onConnectionNameChange,
  onAddConnection,
  groups,
  onAddToGroup,
  onRemoveFromGroup,
  onConnectToNode,
  onClose,
}: NodePopupProps) {
  const memberGroups = groups.filter((g) =>
    g.memberNodeIds.includes(node.id)
  );
  const availableGroups = groups.filter(
    (g) => !g.memberNodeIds.includes(node.id)
  );

  return (
    <div
      className="absolute z-30 w-72 p-4 bg-white/95 dark:bg-sky-950/95 rounded-xl border border-sky-200 dark:border-sky-700 shadow-lg backdrop-blur-sm"
      style={{
        left: position.x + node.radius + 12,
        top: position.y,
        transform: "translateY(-50%)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <form onSubmit={onAddConnection} className="space-y-3">
        <label
          htmlFor="new-connection"
          className="block text-sm font-medium text-sky-800 dark:text-sky-200"
        >
          Add connection to <strong>{node.name}</strong>
        </label>
        <div className="flex gap-2">
          <input
            id="new-connection"
            type="text"
            value={newConnectionName}
            onChange={(e) => onConnectionNameChange(e.target.value)}
            placeholder="Connection name"
            className="flex-1 px-3 py-2 border border-sky-200 dark:border-sky-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-sky-900 dark:text-white text-sm text-sky-900 placeholder:text-sky-300"
            autoFocus
          />
          <button
            type="submit"
            className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white font-medium rounded-lg transition-colors text-sm shrink-0"
          >
            Add
          </button>
        </div>
      </form>
      <div className="mt-2 pt-2 border-t border-sky-100 dark:border-sky-700">
        <p className="text-xs text-sky-500 dark:text-sky-400 mb-2">
          Add <strong>{node.name}</strong> to a group
        </p>
        <div className="flex flex-wrap gap-1">
          {availableGroups.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => onAddToGroup(g.id)}
              className="px-2 py-1 text-xs bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 rounded hover:bg-violet-200 dark:hover:bg-violet-800/50"
            >
              + {g.name}
            </button>
          ))}
          {memberGroups.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => onRemoveFromGroup(g.id)}
              className="px-2 py-1 text-xs bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded hover:bg-slate-300 dark:hover:bg-slate-600"
            >
              − {g.name}
            </button>
          ))}
          {groups.length === 0 && (
            <span className="text-xs text-sky-400">
              Add a group from the header first, then click nodes to add
              them.
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onConnectToNode}
        className="mt-2 w-full px-4 py-2 text-sm text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/30 rounded-lg transition-colors font-medium"
      >
        Connect to another node
      </button>
      <button
        type="button"
        onClick={onClose}
        className="mt-2 w-full px-4 py-2 text-sm text-sky-500 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-800/30 rounded-lg transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}
