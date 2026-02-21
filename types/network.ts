import type * as d3 from "d3";

export interface NodeData {
  id: string;
  name: string;
  type: "user" | "connection";
  radius: number;
  x?: number;
  y?: number;
}

export interface Node extends d3.SimulationNodeDatum, NodeData {}

export interface LinkData {
  source: string;
  target: string;
}

export interface BubbleGroup {
  id: string;
  name: string;
  memberNodeIds: string[];
}

export interface SavedBubble {
  name: string;
  nodes: NodeData[];
  links: LinkData[];
  groups?: BubbleGroup[];
}

export interface Link extends d3.SimulationLinkDatum<Node> {
  source: Node | string;
  target: Node | string;
}
