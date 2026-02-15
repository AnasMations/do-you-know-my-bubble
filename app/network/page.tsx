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

interface Node extends d3.SimulationNodeDatum, NodeData { }

interface LinkData {
  source: string;
  target: string;
}

interface SavedBubble {
  name: string;
  nodes: NodeData[];
  links: LinkData[];
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
  return {
    id,
    name,
    type,
    radius: type === "user" ? 35 : 22,
  };
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
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<d3.Simulation<Node, Link> | null>(null);
  const didDragRef = useRef(false);
  const nextIdRef = useRef(0);
  const hasFlushedPositionsRef = useRef(false);
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
        setNodes(saved.nodes);
        setLinks(saved.links);
        setSubmitted(true);
        const maxConn = saved.nodes.reduce((max, n) => {
          if (n.id.startsWith("conn-")) {
            const num = parseInt(n.id.replace("conn-", ""), 10);
            return Math.max(max, isNaN(num) ? 0 : num);
          }
          return max;
        }, -1);
        nextIdRef.current = maxConn + 1;
      }
    } catch {
      // ignore invalid or old data
    }
  }, []);

  // Save bubble to localStorage whenever it changes
  useEffect(() => {
    if (!submitted || !name.trim() || nodes.length === 0) return;
    const data: SavedBubble = { name: name.trim(), nodes, links };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // ignore quota or other errors
    }
  }, [submitted, name, nodes, links]);

  // Keep refs in sync so handlers inside effect can read current state
  useEffect(() => {
    isFrozenRef.current = isFrozen;
  }, [isFrozen]);
  useEffect(() => {
    linkFromNodeIdRef.current = linkFromNodeId;
  }, [linkFromNodeId]);

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

  // Only change when nodes/links are added or removed (not when only x,y change).
  // This prevents the effect from re-running when we flush positions → no re-render loop.
  const nodeIdsKey =
    nodes.length + "-" + [...nodes.map((n) => n.id)].sort().join(",");
  const linksKey =
    links.length +
    "-" +
    [...links.map((l) => `${l.source}-${l.target}`)].sort().join(",");
  const graphStructure = useMemo(
    () => ({ nodeIdsKey, linksKey }),
    [nodeIdsKey, linksKey]
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

    // Add circles for nodes with gradient
    node
      .append("circle")
      .attr("r", (d) => d.radius)
      .attr("fill", (d) => {
        if (d.type === "user") {
          return "#3b82f6"; // Blue for user
        }
        return "#10b981"; // Green for connections
      })
      .attr("stroke", "#fff")
      .attr("stroke-width", 3)
      .style("filter", "drop-shadow(0 2px 4px rgba(0,0,0,0.2))");

    // Add labels with better styling
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
  }, [submitted, name, graphStructure, addLinkBetweenNodes]);

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
        <div className="flex gap-2">
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
            className="px-4 py-2 bg-slate-500 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
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
            className="px-4 py-2 bg-slate-500 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            Unfreeze layout
          </button>
        </div>
      </div>
      <div className="flex-1 relative border-2 border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-900 min-h-0">
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
          }}
        />
        {selectedNode && popupPosition && (
          <div
            className="absolute z-10 w-72 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 shadow-lg"
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
      </div>
    </div>
  );
}
