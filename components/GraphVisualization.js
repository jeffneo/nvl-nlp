"use client";
import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
const InteractiveNvlWrapper = dynamic(
  () =>
    import(
      "@neo4j-nvl/react/lib/interactive-nvl-wrapper/InteractiveNvlWrapper"
    ).then((mod) => mod.InteractiveNvlWrapper),
  { ssr: false }
);

const colorNode = (label) => {
  if (label === "Topic") {
    return "#c2ffe1";
  } else if (label === "Table") {
    return "#e53935";
  } else if (label === "Domain") {
    return "#c5e5fe";
  } else if (label === "Concept") {
    return "#ffd7b3";
  } else if (label === "Column") {
    return "#ddc4fc";
  } else {
    return "#dad4b6";
  }
};

const pickLabel = (node, labels) => {
  if (labels.includes("Component") || node.id.includes("Component")) {
    return "Topic";
  } else if (labels.includes("Table") || node.id.includes("Table")) {
    return "Table";
  } else if (labels.includes("Schema") || node.id.includes("Schema")) {
    return "Domain";
  } else if (labels.includes("Joined") || node.id.includes("Joined")) {
    return "Concept";
  } else if (labels.includes("Column") || node.id.includes("Column")) {
    return "Column";
  } else {
    return null;
  }
};

const estimateMaxDistance = (nodes) => {
  let maxX = 0;
  let maxY = 0;

  for (const node of nodes) {
    if (Math.abs(node.x) > maxX) maxX = Math.abs(node.x);
    if (Math.abs(node.y) > maxY) maxY = Math.abs(node.y);
  }

  return Math.sqrt(maxX * maxX + maxY * maxY);
};

// Easing function
const easeInOutQuad = (t) => {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
};

// Clamp helper
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const GraphVisualization = ({
  nodes,
  rels,
  // loading,
  focusNodeId,
  setFocusNodeId,
  // setLayoutDone,
}) => {
  const [nvlNodes, setNvlNodes] = useState(nodes);
  const [nvlRels, setNvlRels] = useState(rels);
  const nvlRef = useRef(null);
  const maxPossibleDistanceRef = useRef(estimateMaxDistance(nodes)); // Store estimated max distance
  const animationFrameIdRef = useRef(null); // Track the current animation frame for canceling

  const [hoveredNode, setHoveredNode] = useState(null); // data about the hovered node
  const [infoBoxPos, setInfoBoxPos] = useState({ x: 0, y: 0 }); // screen coords for box

  useEffect(() => {
    setNvlNodes(nodes);
    setNvlRels(rels);
  }, [nodes, rels]); // Ensure nodes and rels are set initially

  // const nvlCallbacks = {
  //   onLayoutDone: () => {
  //     setLayoutDone(true);
  //   },
  // };

  // Now the main focus function
  const focus = (x, y, zoom = 1.5) => {
    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }

    if (!nvlRef.current) {
      console.error("nvlRef.current is null at focus time");
      return;
    }

    const { x: startX, y: startY } = nvlRef.current.getPan();
    let startZoom = nvlRef.current.getScale();
    let startTime = null;

    // Nudge zoom if identical
    if (Math.abs(startZoom - zoom) < 0.000001) {
      startZoom += 0.000001 * (Math.random() > 0.5 ? 1 : -1);
    }

    // --- Calculate dynamic duration based on distance ---
    const dx = x - startX;
    const dy = y - startY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Initialize maximum distance once
    if (maxPossibleDistanceRef.current === null && nodes.length > 0) {
      maxPossibleDistanceRef.current = estimateMaxDistance(nodes);
    }

    // Compute a dynamic duration (scaled between min and max)
    const MIN_DURATION = 1000; // 1 second minimum
    const MAX_DURATION = 3000; // 3 seconds maximum
    const maxDistance = maxPossibleDistanceRef.current || 5000; // fallback if still null

    // Rough scale: farther means longer duration
    let duration = (distance / maxDistance) * MAX_DURATION;
    duration = clamp(duration, MIN_DURATION, MAX_DURATION);

    // Now standard animation
    const animate = (currentTime) => {
      if (startTime === null) startTime = currentTime;

      const elapsedTime = currentTime - startTime;
      let progress = Math.min(elapsedTime / duration, 1);
      let easedProgress = easeInOutQuad(progress);

      const newX = startX + dx * easedProgress;
      const newY = startY + dy * easedProgress;
      const newZoom = startZoom + (zoom - startZoom) * easedProgress;

      nvlRef.current.setZoomAndPan(newZoom, newX, newY);

      if (progress < 1) {
        animationFrameIdRef.current = requestAnimationFrame(animate);
      } else {
        animationFrameIdRef.current = null;
      }
    };

    animationFrameIdRef.current = requestAnimationFrame(animate);
  };

  // Focus on the node if focusNodeId is provided
  useEffect(() => {
    if (focusNodeId && nvlRef.current) {
      const nodePositions = nvlRef.current.getNodePositions();
      const position = nodePositions.find((elem) => elem.id === focusNodeId);
      if (position) {
        const { x, y } = position;
        const screenCenterOffsetX = (window.innerWidth / 2) * 0.5; // 50% of half screen width (left half for chat)
        const screenCenterOffsetY = (window.innerHeight / 2) * 0.5; // 1/2 screen height for bottom component
        focus(x - screenCenterOffsetX, y + screenCenterOffsetY, 1.5); // Random zoom between 1.5 and 2.0
        // Set the selected state for nodes and relationships
        setNvlNodes((prev) =>
          prev.map((node) =>
            node.id === focusNodeId
              ? { ...node, selected: true }
              : { ...node, selected: false }
          )
        );
        setNvlRels((prev) =>
          prev.map((rel) =>
            rel.from === focusNodeId
              ? { ...rel, selected: true }
              : { ...rel, selected: false }
          )
        );
      }
    }
  }, [focusNodeId]);

  const handleNodeDoubleClick = async (nodeId) => {
    // pin node
    setNvlNodes((prev) =>
      prev.map((node) =>
        node.id === nodeId ? { ...node, pinned: true } : node
      )
    );
    setFocusNodeId(nodeId); // Set the focus node ID to trigger the effect
    try {
      const res = await fetch(
        `/api/graph-visualization?option=node-expand&nodeId=${encodeURIComponent(
          nodeId
        )}`
      );
      if (!res.ok) throw new Error("Failed to expand node");
      const data = await res.json();
      // You can now update your graph with new nodes/rels
      console.log("Expanded node data:", data);
      // nvlRef.current.addAndUpdateElementsInGraph(data.nodes, data.rels);
      setNvlNodes((prev) => [...prev, ...data.nodes]);
      setNvlRels((prev) => [...prev, ...data.rels]);
    } catch (err) {
      console.error("Expansion failed:", err);
    }
  };

  const handleNodeMouseOver = (node, event) => {
    setHoveredNode(node);
    setInfoBoxPos({ x: event.clientX, y: event.clientY }); // or event.pageX/pageY if you prefer
  };

  const handleNodeMouseOut = () => {
    setHoveredNode(null);
  };

  const mouseEventCallbacks = {
    onDrag: () => null,
    onPan: () => null,
    onZoom: () => null,
    onNodeDoubleClick: (node) => {
      handleNodeDoubleClick(node.id);
    },
    onHover: (element, hitTargets, evt) => {
      if (element && !element.from) {
        // This is a node hover
        handleNodeMouseOver(element, evt);
      } else {
        handleNodeMouseOut();
      }
    },
  };

  return (
    <div className="fixed inset-0">
      <div className="w-full h-full text-white flex justify-center items-center border-1 border-neutral-content relative">
        <div className="bg-white rounded-lg shadow absolute top-2 right-2 z-10 py-2 px-4">
          {["Domain", "Topic", "Concept", "Column", "Table"].map((label) => (
            <div
              key={label}
              className="flex items-center gap-1 p-1 text-xs text-black/50"
            >
              <div
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: colorNode(label) }}
              />
              <div>{label}</div>
            </div>
          ))}
        </div>
        <div className="absolute inset-0">
          <InteractiveNvlWrapper
            ref={nvlRef}
            nodes={nvlNodes.map(({ labels, description, ...others }) => ({
              ...others,
              color: colorNode(pickLabel(others, labels)),
            }))}
            rels={nvlRels.map(({ probability, ...others }) => ({
              ...others,
            }))}
            mouseEventCallbacks={mouseEventCallbacks}
            nvlOptions={{
              selectedBorderColor: "#ffff00",
              selectedInnerBorderColor: "#ffff00",
              initialZoom: 1,
              layoutTimeLimit: 50,
            }}
            // nvlCallbacks={nvlCallbacks}
            layoutOptions={{ gravity: 0 }}
          />
        </div>

        {hoveredNode && (
          <div
            className="absolute z-50 bg-white border rounded shadow px-4 py-2"
            style={{
              top: infoBoxPos.y + 10, // Offset so it doesn’t cover the mouse
              left: infoBoxPos.x + 10,
              pointerEvents: "none", // Makes the box "hover transparent"
              minWidth: 120,
              maxWidth: 300, // Limit width to avoid overflow
              // You can clamp or adjust the position to avoid overflow
            }}
          >
            <div className="font-bold mb-1 text-black">{hoveredNode.id}</div>
            <div className="text-sm text-gray-700">
              {hoveredNode.captions[0].value}
            </div>
            {/* Add more node info as needed */}
          </div>
        )}
      </div>
    </div>
  );
};

export default GraphVisualization;
