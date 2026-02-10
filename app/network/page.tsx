"use client";

import { useState, useEffect, useRef } from "react";
import * as d3 from "d3";

interface Node extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  type: "user" | "connection";
  radius: number;
}

interface Link extends d3.SimulationLinkDatum<Node> {
  source: Node | string;
  target: Node | string;
}

export default function NetworkPage() {
  const [name, setName] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [connections, setConnections] = useState<string[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<d3.Simulation<Node, Link> | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      setSubmitted(true);
      // Initialize with some sample connections for demonstration
      // In a real app, this would come from an API
      setConnections([
        "Alice",
        "Bob",
        "Charlie",
        "Diana",
        "Eve",
        "Frank",
        "Grace",
        "Henry",
      ]);
    }
  };

  useEffect(() => {
    if (!submitted || !svgRef.current || connections.length === 0) return;

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

    // Create nodes
    const nodes: Node[] = [
      {
        id: "user",
        name: name,
        type: "user",
        radius: 35,
      },
      ...connections.map((conn, i) => ({
        id: `conn-${i}`,
        name: conn,
        type: "connection" as const,
        radius: 22,
      })),
    ];

    // Create links - user connected to all connections
    const links: Link[] = connections.map((_, i) => ({
      source: "user",
      target: `conn-${i}`,
    }));

    // Create force simulation
    const simulation = d3
      .forceSimulation<Node>(nodes)
      .force(
        "link",
        d3
          .forceLink<Node, Link>(links)
          .id((d) => d.id)
          .distance(180)
      )
      .force("charge", d3.forceManyBody().strength(-400))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius((d) => d.radius + 15));

    simulationRef.current = simulation;

    // Create SVG elements
    const link = container
      .append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(links)
      .enter()
      .append("line")
      .attr("stroke", "#94a3b8")
      .attr("stroke-opacity", 0.5)
      .attr("stroke-width", 2.5);

    const node = container
      .append("g")
      .attr("class", "nodes")
      .selectAll("g")
      .data(nodes)
      .enter()
      .append("g")
      .style("cursor", "grab")
      .call(
        d3
          .drag<SVGGElement, Node>()
          .on("start", dragstarted)
          .on("drag", dragged)
          .on("end", dragended)
      );

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

      // Center the graph after simulation has stabilized
      if (!hasCentered && simulation.alpha() < 0.1) {
        hasCentered = true;

        // Calculate bounds of all nodes
        const nodeBounds = {
          minX: Infinity,
          minY: Infinity,
          maxX: -Infinity,
          maxY: -Infinity,
        };

        nodes.forEach((n) => {
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

        // Calculate scale and translation to center the graph
        const padding = 50;
        const scale = Math.min(
          (width - padding * 2) / graphWidth,
          (height - padding * 2) / graphHeight,
          1
        );

        const translateX = width / 2 - scale * graphCenterX;
        const translateY = height / 2 - scale * graphCenterY;

        // Apply transform to center the graph
        svg
          .transition()
          .duration(750)
          .call(
            zoom.transform,
            d3.zoomIdentity.translate(translateX, translateY).scale(scale)
          );
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
      d3.select(event.sourceEvent.target).style("cursor", "grab");
    }

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);
      if (simulationRef.current) {
        simulationRef.current.stop();
      }
    };
  }, [submitted, name, connections]);

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

  return (
    <div className="flex flex-col h-screen p-8">
      <div className="mb-6 flex-shrink-0">
        <h1 className="text-3xl font-bold mb-2">
          {name}&apos;s Network Bubble
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-2">
          Your connections and relationships visualized
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-500">
          Drag nodes to rearrange • Scroll to zoom • Click and drag to pan
        </p>
      </div>
      <div className="flex-1 border-2 border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-900 min-h-0">
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          style={{ display: "block" }}
        />
      </div>
    </div>
  );
}
