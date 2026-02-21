"use client";

import {
  useEffect,
  useRef,
  useMemo,
  type RefObject,
  type Dispatch,
  type SetStateAction,
} from "react";
import * as d3 from "d3";
import type {
  NodeData,
  LinkData,
  BubbleGroup,
  Node,
  Link,
} from "@/types/network";

interface UseNetworkGraphOptions {
  submitted: boolean;
  name: string;
  nodes: NodeData[];
  links: LinkData[];
  groups: BubbleGroup[];
  svgRef: RefObject<SVGSVGElement | null>;
  setNodes: Dispatch<SetStateAction<NodeData[]>>;
  setIsFrozen: Dispatch<SetStateAction<boolean>>;
  onNodeClick: (nodeId: string, screenX: number, screenY: number) => void;
  addLinkBetweenNodes: (sourceId: string, targetId: string) => void;
  addNodeToGroup: (groupId: string, nodeId: string) => void;
  isFrozenRef: RefObject<boolean>;
  linkFromNodeIdRef: RefObject<string | null>;
  addToGroupIdRef: RefObject<string | null>;
}

export function useNetworkGraph({
  submitted,
  name,
  nodes,
  links,
  groups,
  svgRef,
  setNodes,
  setIsFrozen,
  onNodeClick,
  addLinkBetweenNodes,
  addNodeToGroup,
  isFrozenRef,
  linkFromNodeIdRef,
  addToGroupIdRef,
}: UseNetworkGraphOptions) {
  const simulationRef = useRef<d3.Simulation<Node, Link> | null>(null);
  const didDragRef = useRef(false);
  const hasFlushedPositionsRef = useRef(false);

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

    setIsFrozen(false);
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const getDimensions = () => {
      const rect = svgRef.current?.getBoundingClientRect();
      return {
        width: rect?.width || window.innerWidth - 64,
        height: Math.max(rect?.height || 600, 600),
      };
    };

    let { width, height } = getDimensions();

    const container = svg.append("g");

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 3])
      .on("zoom", (event) => {
        container.attr("transform", event.transform.toString());
      });

    svg.call(zoom);

    const nodesData: Node[] = nodes.map((n) => ({ ...n, x: n.x, y: n.y }));
    const linksData: Link[] = links.map((l) => ({
      ...l,
      source: l.source,
      target: l.target,
    }));

    const allHadPositions = nodesData.every(
      (n) => n.x != null && n.y != null
    );
    hasFlushedPositionsRef.current = false;

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
      .force(
        "collision",
        d3.forceCollide<Node>().radius((d) => d.radius + 15)
      );

    simulationRef.current = simulation;

    // Bubble group hulls (drawn behind everything)
    const bubbleGroupsG = container
      .append("g")
      .attr("class", "bubble-groups")
      .lower();

    const groupPaths = bubbleGroupsG
      .selectAll<SVGPathElement, BubbleGroup>("path")
      .data(groups, (d) => d.id)
      .join("path")
      .attr("fill", "rgba(125, 211, 252, 0.18)")
      .attr("stroke", "#38bdf8")
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "6 4")
      .attr("pointer-events", "none");

    const link = container
      .append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(linksData)
      .enter()
      .append("line")
      .attr("stroke", "#7dd3fc")
      .attr("stroke-opacity", 0.6)
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
            if (isFrozenRef.current) return;
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
        onNodeClick(d.id, pt[0], pt[1]);
      }
    });

    node
      .append("circle")
      .attr("r", (d) => d.radius)
      .attr("fill", (d) => (d.type === "user" ? "#0ea5e9" : "#7dd3fc"))
      .attr("stroke", (d) => (d.type === "user" ? "#0284c7" : "#38bdf8"))
      .attr("stroke-width", 3)
      .style("filter", "drop-shadow(0 2px 6px rgba(14,165,233,0.35))");

    node
      .append("text")
      .text((d) => d.name)
      .attr("text-anchor", "middle")
      .attr("dy", (d) => d.radius + 18)
      .attr("fill", "#0c4a6e")
      .attr("font-size", (d) => (d.type === "user" ? "14px" : "12px"))
      .attr("font-weight", (d) => (d.type === "user" ? "bold" : "500"))
      .attr("pointer-events", "none");

    node
      .on("mouseover", function (_event, d) {
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
      .on("mouseout", function (_event, d) {
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

    simulation.on("tick", () => {
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
                d3.zoomIdentity
                  .translate(translateX, translateY)
                  .scale(scale)
              );
          }
        }
      }
    });

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
      setNodes((prev) =>
        prev.map((n) =>
          n.id === event.subject.id
            ? { ...n, x: event.subject.x!, y: event.subject.y! }
            : n
        )
      );
      d3.select(event.sourceEvent.target).style("cursor", "grab");
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      simulationRef.current?.stop();
    };
    // Depend only on graphStructure (not nodes/links) to avoid re-running
    // when position-only updates flush to state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted, name, graphStructure, addLinkBetweenNodes, addNodeToGroup]);

  return { simulationRef };
}
