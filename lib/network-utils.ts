import type {
  NodeData,
  LinkData,
  BubbleGroup,
  SavedBubble,
} from "@/types/network";

export const STORAGE_KEY = "do-you-know-my-bubble";

export function createNode(
  id: string,
  name: string,
  type: "user" | "connection"
): NodeData {
  const radius = type === "user" ? 35 : 22;
  return { id, name, type, radius };
}

export interface LoadedBubble {
  name: string;
  nodes: NodeData[];
  links: LinkData[];
  groups: BubbleGroup[];
  nextConnId: number;
  nextGroupId: number;
}

export function loadBubbleFromStorage(): LoadedBubble | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved: SavedBubble = JSON.parse(raw);
    if (
      !saved?.name ||
      !Array.isArray(saved.nodes) ||
      !Array.isArray(saved.links) ||
      saved.nodes.length === 0
    ) {
      return null;
    }

    type SavedNode = NodeData | (Omit<NodeData, "type"> & { type: "group" });
    const savedNodes = saved.nodes as SavedNode[];
    const groupNodeIds = new Set(
      savedNodes
        .filter(
          (n): n is Omit<NodeData, "type"> & { type: "group" } =>
            n.type === "group"
        )
        .map((n) => n.id)
    );

    const nodes = savedNodes.filter(
      (n): n is NodeData => n.type !== "group"
    );
    const links = saved.links.filter(
      (l) => !groupNodeIds.has(l.source) && !groupNodeIds.has(l.target)
    );
    const groups = Array.isArray(saved.groups) ? saved.groups : [];

    const nextConnId =
      saved.nodes.reduce((max, n) => {
        if (n.id.startsWith("conn-")) {
          const num = parseInt(n.id.replace("conn-", ""), 10);
          return Math.max(max, isNaN(num) ? 0 : num);
        }
        return max;
      }, -1) + 1;

    const nextGroupId =
      (saved.groups ?? []).reduce((max, g) => {
        if (g.id.startsWith("group-")) {
          const num = parseInt(g.id.replace("group-", ""), 10);
          return Math.max(max, isNaN(num) ? 0 : num);
        }
        return max;
      }, -1) + 1;

    return { name: saved.name, nodes, links, groups, nextConnId, nextGroupId };
  } catch {
    return null;
  }
}

export function saveBubbleToStorage(
  name: string,
  nodes: NodeData[],
  links: LinkData[],
  groups: BubbleGroup[]
): void {
  const data: SavedBubble = {
    name: name.trim(),
    nodes,
    links,
    groups: groups.length > 0 ? groups : undefined,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // quota or other storage errors
  }
}
