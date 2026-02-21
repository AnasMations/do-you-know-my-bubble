"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import type { NodeData, LinkData, BubbleGroup } from "@/types/network";
import {
  createNode,
  loadBubbleFromStorage,
  saveBubbleToStorage,
} from "@/lib/network-utils";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { useNetworkGraph } from "@/hooks/use-network-graph";
import { NameEntryForm } from "@/components/network/NameEntryForm";
import { GraphToolbar } from "@/components/network/GraphToolbar";
import { LinkModeBanner } from "@/components/network/LinkModeBanner";
import { GroupModeBanner } from "@/components/network/GroupModeBanner";

const NodePopup = dynamic(
  () => import("@/components/network/NodePopup"),
  { ssr: false }
);

export default function NetworkPage() {
  const [name, setName] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [links, setLinks] = useState<LinkData[]>([]);
  const [groups, setGroups] = useState<BubbleGroup[]>([]);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [popupPosition, setPopupPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [newConnectionName, setNewConnectionName] = useState("");
  const [isFrozen, setIsFrozen] = useState(false);
  const [linkFromNodeId, setLinkFromNodeId] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [showAddGroupForm, setShowAddGroupForm] = useState(false);
  const [addToGroupId, setAddToGroupId] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const nextIdRef = useRef(0);
  const nextGroupIdRef = useRef(0);
  const isFrozenRef = useRef(false);
  const linkFromNodeIdRef = useRef<string | null>(null);
  const addToGroupIdRef = useRef<string | null>(null);

  const { isFullscreen, toggleFullscreen } = useFullscreen(graphContainerRef);

  // ── Persistence ──────────────────────────────────────────────

  /* eslint-disable */
  // localStorage isn't available during SSR, so we must load in an effect.
  useEffect(() => {
    const saved = loadBubbleFromStorage();
    if (saved) {
      setName(saved.name);
      setNodes(saved.nodes);
      setLinks(saved.links);
      setGroups(saved.groups);
      setSubmitted(true);
      nextIdRef.current = saved.nextConnId;
      nextGroupIdRef.current = saved.nextGroupId;
    }
  }, []);
  /* eslint-enable */

  useEffect(() => {
    if (!submitted || !name.trim() || nodes.length === 0) return;
    saveBubbleToStorage(name, nodes, links, groups);
  }, [submitted, name, nodes, links, groups]);

  // ── Keep refs in sync for D3 event handlers ──────────────────

  useEffect(() => {
    isFrozenRef.current = isFrozen;
  }, [isFrozen]);
  useEffect(() => {
    linkFromNodeIdRef.current = linkFromNodeId;
  }, [linkFromNodeId]);
  useEffect(() => {
    addToGroupIdRef.current = addToGroupId;
  }, [addToGroupId]);

  // ── Callbacks ────────────────────────────────────────────────

  const addConnectionToNode = useCallback(
    (fromNodeId: string, connectionName: string) => {
      const trimmed = connectionName.trim();
      if (!trimmed) return;
      const newId = `conn-${nextIdRef.current++}`;
      setNodes((prev) => [...prev, createNode(newId, trimmed, "connection")]);
      setLinks((prev) => [...prev, { source: fromNodeId, target: newId }]);
      setNewConnectionName("");
      setSelectedNodeId(null);
      setPopupPosition(null);
    },
    []
  );

  const addLinkBetweenNodes = useCallback(
    (sourceId: string, targetId: string) => {
      if (sourceId === targetId) return;
      setLinks((prev) => {
        const exists = prev.some(
          (l) =>
            (l.source === sourceId && l.target === targetId) ||
            (l.source === targetId && l.target === sourceId)
        );
        if (exists) return prev;
        return [...prev, { source: sourceId, target: targetId }];
      });
      setLinkFromNodeId(null);
    },
    []
  );

  const addNodeToGroup = useCallback((groupId: string, nodeId: string) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId && !g.memberNodeIds.includes(nodeId)
          ? { ...g, memberNodeIds: [...g.memberNodeIds, nodeId] }
          : g
      )
    );
  }, []);

  const removeNodeFromGroup = useCallback(
    (groupId: string, nodeId: string) => {
      setGroups((prev) =>
        prev.map((g) =>
          g.id === groupId
            ? {
                ...g,
                memberNodeIds: g.memberNodeIds.filter((id) => id !== nodeId),
              }
            : g
        )
      );
    },
    []
  );

  const handleNodeClick = useCallback(
    (nodeId: string, screenX: number, screenY: number) => {
      setPopupPosition({ x: screenX, y: screenY });
      setSelectedNodeId(nodeId);
    },
    []
  );

  const clearSelection = useCallback(() => {
    setSelectedNodeId(null);
    setPopupPosition(null);
    setNewConnectionName("");
    setLinkFromNodeId(null);
    setAddToGroupId(null);
  }, []);

  // ── D3 graph simulation ──────────────────────────────────────

  const { simulationRef } = useNetworkGraph({
    submitted,
    name,
    nodes,
    links,
    groups,
    svgRef,
    setNodes,
    setIsFrozen,
    onNodeClick: handleNodeClick,
    addLinkBetweenNodes,
    addNodeToGroup,
    isFrozenRef,
    linkFromNodeIdRef,
    addToGroupIdRef,
  });

  // ── Freeze / unfreeze ────────────────────────────────────────

  const handleFreeze = useCallback(() => {
    const sim = simulationRef.current;
    if (sim) {
      sim.nodes().forEach((n) => {
        n.fx = n.x ?? undefined;
        n.fy = n.y ?? undefined;
      });
      setIsFrozen(true);
    }
  }, [simulationRef]);

  const handleUnfreeze = useCallback(() => {
    const sim = simulationRef.current;
    if (sim) {
      sim.nodes().forEach((n) => {
        n.fx = null;
        n.fy = null;
      });
      setIsFrozen(false);
    }
  }, [simulationRef]);

  // ── Group creation ───────────────────────────────────────────

  const handleAddGroup = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = newGroupName.trim();
      if (!trimmed) return;
      const newId = `group-${nextGroupIdRef.current++}`;
      setGroups((prev) => [
        ...prev,
        { id: newId, name: trimmed, memberNodeIds: [] },
      ]);
      setNewGroupName("");
      setShowAddGroupForm(false);
      setAddToGroupId(newId);
    },
    [newGroupName]
  );

  // ── Initial submit ──────────────────────────────────────────

  const handleSubmit = useCallback(() => {
    setSubmitted(true);
    setNodes([createNode("user", name, "user")]);
    setLinks([]);
    nextIdRef.current = 0;
  }, [name]);

  // ── Render ───────────────────────────────────────────────────

  if (!submitted) {
    return (
      <NameEntryForm
        name={name}
        onNameChange={setName}
        onSubmit={handleSubmit}
      />
    );
  }

  const selectedNode = selectedNodeId
    ? nodes.find((n) => n.id === selectedNodeId)
    : null;

  return (
    <div className="flex flex-col h-screen p-8 bg-sky-50">
      <div className="mb-6 shrink-0">
        <h1 className="text-3xl font-bold mb-2 text-sky-900">
          {name}&apos;s Network Bubble
        </h1>
        <p className="text-sky-600 mb-2">
          Your connections and relationships visualized
        </p>
        <p className="text-sm text-sky-400 mb-4">
          Drag nodes to rearrange • Scroll to zoom • Click and drag to pan •
          Click a bubble to add connections to it
        </p>
      </div>
      <div
        ref={graphContainerRef}
        className="flex-1 relative border-2 border-sky-200 rounded-xl overflow-hidden bg-sky-100/60 min-h-0"
      >
        <GraphToolbar
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          isFrozen={isFrozen}
          onFreeze={handleFreeze}
          onUnfreeze={handleUnfreeze}
          showAddGroupForm={showAddGroupForm}
          onToggleGroupForm={setShowAddGroupForm}
          newGroupName={newGroupName}
          onGroupNameChange={setNewGroupName}
          onAddGroup={handleAddGroup}
        />
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          style={{ display: "block" }}
          onClick={clearSelection}
        />
        {selectedNode && popupPosition && (
          <NodePopup
            node={selectedNode}
            position={popupPosition}
            newConnectionName={newConnectionName}
            onConnectionNameChange={setNewConnectionName}
            onAddConnection={(e) => {
              e.preventDefault();
              if (selectedNodeId)
                addConnectionToNode(selectedNodeId, newConnectionName);
            }}
            groups={groups}
            onAddToGroup={(groupId) =>
              addNodeToGroup(groupId, selectedNodeId!)
            }
            onRemoveFromGroup={(groupId) =>
              removeNodeFromGroup(groupId, selectedNodeId!)
            }
            onConnectToNode={() => {
              setLinkFromNodeId(selectedNodeId);
              setSelectedNodeId(null);
              setPopupPosition(null);
              setNewConnectionName("");
            }}
            onClose={() => {
              setSelectedNodeId(null);
              setPopupPosition(null);
              setNewConnectionName("");
            }}
          />
        )}
        {linkFromNodeId && (
          <LinkModeBanner
            nodeName={
              nodes.find((n) => n.id === linkFromNodeId)?.name ?? "node"
            }
            onCancel={() => setLinkFromNodeId(null)}
          />
        )}
        {addToGroupId && (
          <GroupModeBanner
            groupName={
              groups.find((g) => g.id === addToGroupId)?.name ?? "group"
            }
            onDone={() => setAddToGroupId(null)}
          />
        )}
      </div>
    </div>
  );
}
