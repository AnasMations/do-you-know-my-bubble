"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import * as d3 from "d3";

const STORAGE_KEY = "do-you-know-my-bubble";

interface NodeData {
  id: string;
  name: string;
  type: "user" | "connection";
  radius: number;
  x?: number;
  y?: number;
}

interface Node extends d3.SimulationNodeDatum, NodeData {}

interface LinkData {
  source: string;
  target: string;
}

/** A bubble/group that wraps member nodes – drawn as a hull around them */
interface BubbleGroup {
  id: string;
  name: string;
  memberNodeIds: string[];
}

interface SavedBubble {
  name: string;
  nodes: NodeData[];
  links: LinkData[];
  groups?: BubbleGroup[];
}

interface Link extends d3.SimulationLinkDatum<Node> {
  source: Node | string;
  target: Node | string;
}

function createNode(
  id: string,
  name: string,
  type: "user" | "connection"
): NodeData {
  const radius = type === "user" ? 35 : 22;
  return { id, name, type, radius };
}

export default function NetworkPage() {
  const [name, setName] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [links, setLinks] = useState<LinkData[]>([]);
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
  const [groups, setGroups] = useState<BubbleGroup[]>([]);
  const [addToGroupId, setAddToGroupId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<d3.Simulation<Node, Link> | null>(null);
  const didDragRef = useRef(false);
  const nextIdRef = useRef(0);
  const nextGroupIdRef = useRef(0);
  const hasFlushedPositionsRef = useRef(false);
  const addToGroupIdRef = useRef<string | null>(null);
  const isFrozenRef = useRef(false);
  const linkFromNodeIdRef = useRef<string | null>(null);

  // Load saved bubble from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved: SavedBubble = JSON.parse(raw);
      if (
        saved?.name &&
        Array.isArray(saved.nodes) &&
        Array.isArray(saved.links) &&
        saved.nodes.length > 0
      ) {
        setName(saved.name);
        // Migrate: drop old "group" nodes and links to/from them; load bubble groups
        type SavedNode = NodeData | (Omit<NodeData, "type"> & { type: "group" });
        const savedNodes = saved.nodes as SavedNode[];
        const groupNodeIds = new Set(
          savedNodes.filter((n): n is Omit<NodeData, "type"> & { type: "group" } => n.type === "group").map((n) => n.id)
        );
        setNodes(savedNodes.filter((n): n is NodeData => n.type !== "group"));
        setLinks(
          saved.links.filter(
            (l) => !groupNodeIds.has(l.source) && !groupNodeIds.has(l.target)
          )
        );
        setGroups(Array.isArray(saved.groups) ? saved.groups : []);
        setSubmitted(true);
        const maxConn = saved.nodes.reduce((max, n) => {
          if (n.id.startsWith("conn-")) {
            const num = parseInt(n.id.replace("conn-", ""), 10);
            return Math.max(max, isNaN(num) ? 0 : num);
          }
          return max;
        }, -1);
        nextIdRef.current = maxConn + 1;
        const maxGroup = (saved.groups ?? []).reduce(
          (max, g) => {
            if (g.id.startsWith("group-")) {
              const num = parseInt(g.id.replace("group-", ""), 10);
              return Math.max(max, isNaN(num) ? 0 : num);
            }
            return max;
          },
          -1
        );
        nextGroupIdRef.current = maxGroup + 1;
      }
    } catch {
      // ignore invalid or old data
    }
  }, []);

  // Save bubble to localStorage whenever it changes
  useEffect(() => {
    if (!submitted || !name.trim() || nodes.length === 0) return;
    const data: SavedBubble = {
      name: name.trim(),
      nodes,
      links,
      groups: groups.length > 0 ? groups : undefined,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // ignore quota or other errors
    }
  }, [submitted, name, nodes, links, groups]);

  // Keep refs in sync so handlers inside effect can read current state
  useEffect(() => {
    isFrozenRef.current = isFrozen;
  }, [isFrozen]);
  useEffect(() => {
    linkFromNodeIdRef.current = linkFromNodeId;
  }, [linkFromNodeId]);
  useEffect(() => {
    addToGroupIdRef.current = addToGroupId;
  }, [addToGroupId]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      setSubmitted(true);
      setNodes([createNode("user", name, "user")]);
      setLinks([]);
      nextIdRef.current = 0;
    }
  };

  const addConnectionToNode = useCallback(
    (fromNodeId: string, connectionName: string) => {
      const trimmed = connectionName.trim();
      if (!trimmed) return;
      const newId = `conn-${nextIdRef.current++}`;
      const newNode = createNode(newId, trimmed, "connection");
      setNodes((prev) => [...prev, newNode]);
      setLinks((prev) => [...prev, { source: fromNodeId, target: newId }]);
      setNewConnectionName("");
      setSelectedNodeId(null);
      setPopupPosition(null);
    },
    []
  );

  const handleAddConnectionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedNodeId) addConnectionToNode(selectedNodeId, newConnectionName);
  };

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

  const addGroup = useCallback((groupName: string) => {
    const trimmed = groupName.trim();
    if (!trimmed) return;
    const newId = `group-${nextGroupIdRef.current++}`;
    setGroups((prev) => [
      ...prev,
      { id: newId, name: trimmed, memberNodeIds: [] },
    ]);
    setNewGroupName("");
    setShowAddGroupForm(false);
    setAddToGroupId(newId); // enter "add nodes to group" mode
  }, []);

  const addNodeToGroup = useCallback((groupId: string, nodeId: string) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId && !g.memberNodeIds.includes(nodeId)
          ? { ...g, memberNodeIds: [...g.memberNodeIds, nodeId] }
          : g
      )
    );
  }, []);

  const removeNodeFromGroup = useCallback((groupId: string, nodeId: string) => {
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
  }, []);

  const handleAddGroupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addGroup(newGroupName);
  };

  const nodeIdsKey =
    nodes.length + "-" + [...nodes.map((n) => n.id)].sort().join(",");
  const linksKey =
    links.length +
    "-" +
    [...links.map((l) => `${l.source}-${l.target}`)].sort().join(",");
  const groupsKey =
    groups.length +
    "-" +
    [...groups.map((g) => g.id)].sort().join(",");
  const graphStructure = useMemo(
    () => ({ nodeIdsKey, linksKey, groupsKey }),
    [nodeIdsKey, linksKey, groupsKey]
  );

  useEffect(() => {
    if (!submitted || !svgRef.current || nodes.length === 0) return;

    setIsFrozen(false); // reset when graph is recreated (e.g. after adding a node)
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Get actual container dimensions
    const getDimensions = () => {
      const rect = svgRef.current?.getBoundingClientRect();
      return {
        width: rect?.width || window.innerWidth - 64,
        height: Math.max(rect?.height || 600, 600),
      };
    };

    let { width, height } = getDimensions();

    // Create container for zoom/pan
    const container = svg.append("g");

    // Add zoom behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 3])
      .on("zoom", (event) => {
        container.attr("transform", event.transform.toString());
      });

    svg.call(zoom);

    // Use nodes and links from state (copy for simulation, preserve existing x/y)
    const nodesData: Node[] = nodes.map((n) => ({
      ...n,
      x: n.x,
      y: n.y,
    }));
    const linksData: Link[] = links.map((l) => ({
      ...l,
      source: l.source,
      target: l.target,
    }));

    const allHadPositions = nodesData.every(
      (n) => n.x != null && n.y != null
    );
    hasFlushedPositionsRef.current = false;

    // Create force simulation
    const simulation = d3
      .forceSimulation<Node>(nodesData)
      .force(
        "link",
        d3
          .forceLink<Node, Link>(linksData)
          .id((d) => d.id)
          .distance(180)
      )
      .force("charge", d3.forceManyBody().strength(-400))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide<Node>().radius((d) => d.radius + 15));

    simulationRef.current = simulation;

    // Bubble groups (drawn behind links and nodes) – hulls around member nodes
    const bubbleGroupsG = container
      .append("g")
      .attr("class", "bubble-groups")
      .lower();
    const groupPaths = bubbleGroupsG
      .selectAll<SVGPathElement, BubbleGroup>("path")
      .data(groups, (d) => d.id)
      .join("path")
      .attr("fill", "rgba(167, 139, 250, 0.25)")
      .attr("stroke", "#7c3aed")
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "6 4")
      .attr("pointer-events", "none");

    // Create SVG elements
    const link = container
      .append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(linksData)
      .enter()
      .append("line")
      .attr("stroke", "#94a3b8")
      .attr("stroke-opacity", 0.5)
      .attr("stroke-width", 2.5);

    const node = container
      .append("g")
      .attr("class", "nodes")
      .selectAll("g")
      .data(nodesData)
      .enter()
      .append("g")
      .style("cursor", "grab")
      .call(
        d3
          .drag<SVGGElement, Node>()
          .on("start", (event) => {
            didDragRef.current = false;
            if (isFrozenRef.current) return; // don't allow drag when layout is frozen
            dragstarted(event);
          })
          .on("drag", (event) => {
            if (isFrozenRef.current) return;
            didDragRef.current = true;
            dragged(event);
          })
          .on("end", (event) => {
            if (isFrozenRef.current) return;
            dragended(event);
          })
      );

    node.on("click", (event, d) => {
      event.stopPropagation();
      if (!didDragRef.current && svgRef.current) {
        if (addToGroupIdRef.current) {
          addNodeToGroup(addToGroupIdRef.current, d.id);
          return;
        }
        if (linkFromNodeIdRef.current) {
          addLinkBetweenNodes(linkFromNodeIdRef.current, d.id);
          return;
        }
        const transform = d3.zoomTransform(svgRef.current);
        const pt = transform.apply([
          (d as Node).x ?? 0,
          (d as Node).y ?? 0,
        ]);
        setPopupPosition({ x: pt[0], y: pt[1] });
        setSelectedNodeId(d.id);
      }
    });

    // Add circles for nodes
    node
      .append("circle")
      .attr("r", (d) => d.radius)
      .attr("fill", (d) =>
        d.type === "user" ? "#3b82f6" : "#10b981"
      )
      .attr("stroke", "#fff")
      .attr("stroke-width", 3)
      .style("filter", "drop-shadow(0 2px 4px rgba(0,0,0,0.2))");

    // Add labels
    node
      .append("text")
      .text((d) => d.name)
      .attr("text-anchor", "middle")
      .attr("dy", (d) => d.radius + 18)
      .attr("fill", "currentColor")
      .attr("font-size", (d) => (d.type === "user" ? "14px" : "12px"))
      .attr("font-weight", (d) => (d.type === "user" ? "bold" : "500"))
      .attr("pointer-events", "none");

    // Add hover effects
    node
      .on("mouseover", function (event, d) {
        d3.select(this)
          .select("circle")
          .transition()
          .duration(200)
          .attr("r", d.radius * 1.2)
          .attr("stroke-width", 4);
        d3.select(this)
          .select("text")
          .transition()
          .duration(200)
          .attr("font-size", d.type === "user" ? "16px" : "14px");
      })
      .on("mouseout", function (event, d) {
        d3.select(this)
          .select("circle")
          .transition()
          .duration(200)
          .attr("r", d.radius)
          .attr("stroke-width", 3);
        d3.select(this)
          .select("text")
          .transition()
          .duration(200)
          .attr("font-size", d.type === "user" ? "14px" : "12px");
      });

    let hasCentered = false;

    // Update positions on simulation tick
    simulation.on("tick", () => {
      // Update bubble group hulls from member node positions
      groupPaths.each(function (group: BubbleGroup) {
        const points: [number, number][] = [];
        group.memberNodeIds.forEach((id) => {
          const n = nodesData.find((nn) => nn.id === id);
          if (n && n.x != null && n.y != null)
            points.push([n.x as number, n.y as number]);
        });
        let d = "";
        if (points.length >= 3) {
          const hull = d3.polygonHull(points);
          if (hull) d = "M" + hull.map((p) => p.join(",")).join("L") + "Z";
        } else if (points.length === 2) {
          const [[x1, y1], [x2, y2]] = points;
          const cx = (x1 + x2) / 2;
          const cy = (y1 + y2) / 2;
          const r = Math.hypot(x2 - x1, y2 - y1) / 2 + 45;
          d = `M${cx + r},${cy} A${r},${r} 0 0 1 ${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy}Z`;
        } else if (points.length === 1) {
          const [x, y] = points[0];
          const r = 50;
          d = `M${x + r},${y} A${r},${r} 0 0 1 ${x - r},${y} A${r},${r} 0 0 1 ${x + r},${y}Z`;
        }
        d3.select(this)
          .attr("d", d)
          .attr("visibility", d ? "visible" : "hidden");
      });

      link
        .attr("x1", (d) => (d.source as Node).x!)
        .attr("y1", (d) => (d.source as Node).y!)
        .attr("x2", (d) => (d.target as Node).x!)
        .attr("y2", (d) => (d.target as Node).y!);

      node.attr("transform", (d) => `translate(${d.x},${d.y})`);

      // After simulation stabilizes: flush positions to state (once) and optionally center
      if (simulation.alpha() < 0.1) {
        if (!hasFlushedPositionsRef.current) {
          hasFlushedPositionsRef.current = true;
          setNodes(
            nodesData.map((n) => ({
              id: n.id,
              name: n.name,
              type: n.type,
              radius: n.radius,
              x: n.x,
              y: n.y,
            }))
          );
        }
        if (!hasCentered) {
          hasCentered = true;
          if (!allHadPositions) {
            // Only center when we had new nodes (first load or after adding node)
            // Calculate bounds of all nodes
            const nodeBounds = {
              minX: Infinity,
              minY: Infinity,
              maxX: -Infinity,
              maxY: -Infinity,
            };

            nodesData.forEach((n) => {
              if (n.x !== undefined && n.y !== undefined) {
                const r = n.radius;
                nodeBounds.minX = Math.min(nodeBounds.minX, n.x - r);
                nodeBounds.minY = Math.min(nodeBounds.minY, n.y - r);
                nodeBounds.maxX = Math.max(nodeBounds.maxX, n.x + r);
                nodeBounds.maxY = Math.max(nodeBounds.maxY, n.y + r);
              }
            });

            const graphWidth = nodeBounds.maxX - nodeBounds.minX;
            const graphHeight = nodeBounds.maxY - nodeBounds.minY;
            const graphCenterX = (nodeBounds.minX + nodeBounds.maxX) / 2;
            const graphCenterY = (nodeBounds.minY + nodeBounds.maxY) / 2;

            const padding = 50;
            const scale = Math.min(
              (width - padding * 2) / graphWidth,
              (height - padding * 2) / graphHeight,
              1
            );

            const translateX = width / 2 - scale * graphCenterX;
            const translateY = height / 2 - scale * graphCenterY;

            svg
              .transition()
              .duration(750)
              .call(
                zoom.transform,
                d3.zoomIdentity.translate(translateX, translateY).scale(scale)
              );
          }
        }
      }
    });

    // Handle window resize
    const handleResize = () => {
      const newDims = getDimensions();
      width = newDims.width;
      height = newDims.height;
      simulation.force("center", d3.forceCenter(width / 2, height / 2));
      simulation.alpha(0.3).restart();
    };

    window.addEventListener("resize", handleResize);

    function dragstarted(event: d3.D3DragEvent<SVGGElement, Node, Node>) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
      d3.select(event.sourceEvent.target).style("cursor", "grabbing");
    }

    function dragged(event: d3.D3DragEvent<SVGGElement, Node, Node>) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragended(event: d3.D3DragEvent<SVGGElement, Node, Node>) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
      // Persist dragged position so layout is preserved when adding more nodes
      setNodes((prev) =>
        prev.map((n) =>
          n.id === event.subject.id
            ? { ...n, x: event.subject.x!, y: event.subject.y! }
            : n
        )
      );
      d3.select(event.sourceEvent.target).style("cursor", "grab");
    }

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);
      if (simulationRef.current) {
        simulationRef.current.stop();
      }
    };
    // Intentionally depend only on graphStructure (not nodes/links) so that
    // flushing positions to state doesn't re-run this effect and cause a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted, name, graphStructure, addLinkBetweenNodes, addNodeToGroup]);

  if (!submitted) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center p-8">
        <div className="max-w-md w-full">
          <h1 className="text-4xl font-bold mb-4 text-center">
            Enter Your Name
          </h1>
          <p className="text-lg mb-8 text-center text-gray-600 dark:text-gray-400">
            Start building your network bubble
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full px-4 py-3 text-lg border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 dark:bg-gray-800 dark:text-white"
              autoFocus
            />
            <button
              type="submit"
              className="w-full px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-colors"
            >
              Create My Bubble
            </button>
          </form>
        </div>
      </div>
    );
  }

  const selectedNode = selectedNodeId
    ? nodes.find((n) => n.id === selectedNodeId)
    : null;

  return (
    <div className="flex flex-col h-screen p-8">
      <div className="mb-6 shrink-0">
        <h1 className="text-3xl font-bold mb-2">
          {name}&apos;s Network Bubble
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-2">
          Your connections and relationships visualized
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">
          Drag nodes to rearrange • Scroll to zoom • Click and drag to pan •
          Click a bubble to add connections to it
        </p>
      </div>
      <div
        ref={graphContainerRef}
        className="flex-1 relative border-2 border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-900 min-h-0"
      >
        <div
          className="absolute top-3 right-3 z-20 flex flex-col gap-2 p-2 rounded-lg bg-white/90 dark:bg-gray-800/90 shadow-lg border border-gray-200 dark:border-gray-600"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={async () => {
              if (isFullscreen) {
                await document.exitFullscreen();
              } else if (graphContainerRef.current) {
                await graphContainerRef.current.requestFullscreen();
              }
            }}
            className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white font-medium rounded-lg transition-colors text-sm whitespace-nowrap"
          >
            {isFullscreen ? "Exit full screen" : "Full screen"}
          </button>
          <button
            type="button"
            onClick={() => {
              const sim = simulationRef.current;
              if (sim) {
                sim.nodes().forEach((n: Node) => {
                  (n as Node).fx = (n as Node).x ?? undefined;
                  (n as Node).fy = (n as Node).y ?? undefined;
                });
                setIsFrozen(true);
              }
            }}
            disabled={isFrozen}
            className="px-4 py-2 bg-slate-500 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-sm whitespace-nowrap"
          >
            Freeze layout
          </button>
          <button
            type="button"
            onClick={() => {
              const sim = simulationRef.current;
              if (sim) {
                sim.nodes().forEach((n: Node) => {
                  (n as Node).fx = null;
                  (n as Node).fy = null;
                });
                setIsFrozen(false);
              }
            }}
            disabled={!isFrozen}
            className="px-4 py-2 bg-slate-500 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-sm whitespace-nowrap"
          >
            Unfreeze layout
          </button>
          {showAddGroupForm ? (
            <form
              onSubmit={(e) => handleAddGroupSubmit(e)}
              className="flex flex-col gap-2"
            >
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Group name (e.g. Family, Work)"
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 dark:bg-gray-800 dark:text-white text-sm w-40"
                autoFocus
              />
              <div className="flex gap-1">
                <button
                  type="submit"
                  className="flex-1 px-3 py-2 bg-violet-500 hover:bg-violet-600 text-white font-medium rounded-lg transition-colors text-sm"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddGroupForm(false);
                    setNewGroupName("");
                  }}
                  className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowAddGroupForm(true)}
              className="px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white font-medium rounded-lg transition-colors text-sm whitespace-nowrap"
            >
              Add group
            </button>
          )}
        </div>
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          style={{ display: "block" }}
          onClick={() => {
            setSelectedNodeId(null);
            setPopupPosition(null);
            setNewConnectionName("");
            setLinkFromNodeId(null);
            setAddToGroupId(null);
          }}
        />
        {selectedNode && popupPosition && (
          <div
            className="absolute z-30 w-72 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 shadow-lg"
            style={{
              left: popupPosition.x + selectedNode.radius + 12,
              top: popupPosition.y,
              transform: "translateY(-50%)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <form
              onSubmit={handleAddConnectionSubmit}
              className="space-y-3"
            >
              <label
                htmlFor="new-connection"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Add connection to <strong>{selectedNode.name}</strong>
              </label>
              <div className="flex gap-2">
                <input
                  id="new-connection"
                  type="text"
                  value={newConnectionName}
                  onChange={(e) => setNewConnectionName(e.target.value)}
                  placeholder="Connection name"
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white text-sm"
                  autoFocus
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors text-sm shrink-0"
                >
                  Add
                </button>
              </div>
            </form>
            <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                Add <strong>{selectedNode.name}</strong> to a group
              </p>
              <div className="flex flex-wrap gap-1">
                {groups
                  .filter((g) => !g.memberNodeIds.includes(selectedNodeId!))
                  .map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => {
                        addNodeToGroup(g.id, selectedNodeId!);
                      }}
                      className="px-2 py-1 text-xs bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 rounded hover:bg-violet-200 dark:hover:bg-violet-800/50"
                    >
                      + {g.name}
                    </button>
                  ))}
                {groups
                  .filter((g) => g.memberNodeIds.includes(selectedNodeId!))
                  .map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() =>
                        removeNodeFromGroup(g.id, selectedNodeId!)
                      }
                      className="px-2 py-1 text-xs bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded hover:bg-slate-300 dark:hover:bg-slate-600"
                    >
                      − {g.name}
                    </button>
                  ))}
                {groups.length === 0 && (
                  <span className="text-xs text-gray-500">
                    Add a group from the header first, then click nodes to add
                    them.
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setLinkFromNodeId(selectedNodeId);
                setSelectedNodeId(null);
                setPopupPosition(null);
                setNewConnectionName("");
              }}
              className="mt-2 w-full px-4 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors font-medium"
            >
              Connect to another node
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedNodeId(null);
                setPopupPosition(null);
                setNewConnectionName("");
              }}
              className="mt-2 w-full px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
        {linkFromNodeId && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 px-4 py-2 bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700 rounded-lg shadow flex items-center gap-3">
            <span className="text-sm text-amber-800 dark:text-amber-200">
              Click a node to connect to{" "}
              <strong>
                {nodes.find((n) => n.id === linkFromNodeId)?.name ?? "node"}
              </strong>
            </span>
            <button
              type="button"
              onClick={() => setLinkFromNodeId(null)}
              className="px-3 py-1 text-sm bg-amber-200 dark:bg-amber-800 hover:bg-amber-300 dark:hover:bg-amber-700 rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
        {addToGroupId && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 px-4 py-2 bg-violet-100 dark:bg-violet-900/40 border border-violet-300 dark:border-violet-700 rounded-lg shadow flex items-center gap-3">
            <span className="text-sm text-violet-800 dark:text-violet-200">
              Click nodes to add them to{" "}
              <strong>
                {groups.find((g) => g.id === addToGroupId)?.name ?? "group"}
              </strong>
            </span>
            <button
              type="button"
              onClick={() => setAddToGroupId(null)}
              className="px-3 py-1 text-sm bg-violet-200 dark:bg-violet-800 hover:bg-violet-300 dark:hover:bg-violet-700 rounded transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
