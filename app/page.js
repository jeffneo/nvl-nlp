"use client";
import { useState, useEffect, useRef } from "react";
import GraphVisualization from "@/components/GraphVisualization";
import { MoonLoader } from "react-spinners";

const Home = () => {
  const [nodes, setNodes] = useState([]);
  const [rels, setRels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [focusNodeId, setFocusNodeId] = useState(null);

  // Comment box state
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchRef = useRef(null);

  useEffect(() => {
    const fetchGraphVisualization = async () => {
      try {
        const res = await fetch("/api/graph-visualization", {
          method: "GET",
          // body: JSON.stringify({}),
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!res.ok) {
          throw new Error("Network response was not ok");
        }

        const data = await res.json();
        console.log("Data:", data);
        setNodes(data.nodes);
        setRels(data.rels);
      } catch (error) {
        console.error("Error:", error);
      } finally {
        setLoading(false);
      }
    };

    if (fetchRef.current) return;
    fetchRef.current = true;
    fetchGraphVisualization();
  }, []);

  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    if (!comment.trim()) return; // Prevent empty submissions
    setSubmitting(true);
    // Handle sending comment to backend
    try {
      const res = await fetch(
        `/api/graph-visualization?option=graph-rag&content=${encodeURIComponent(
          comment
        )}`
      );
      if (!res.ok) throw new Error("Failed to execute graphRAG");
      const data = await res.json();
      // You can now update your graph with new nodes/rels
      console.log("graphRAG data:", data);
      setNodes((prev) => [...prev, ...data.nodes]);
      setRels((prev) => [...prev, ...data.rels]);
    } catch (err) {
      console.error("graphRAG failed:", err);
    } finally {
      setSubmitting(false);
      setComment(""); // Clear the comment box
    }
  };

  const handleTextareaKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleCommentSubmit(e);
    }
    // If Shift+Enter, do nothing (allows newline)
  };

  return (
    <div className="h-screen w-screen flex justify-center items-center bg-transparent">
      <div className="h-full w-full relative">
        <>
          {loading ? (
            <MoonLoader
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
              color="oklch(0.488 0.243 264.376)"
              size={50}
              loading={true}
            />
          ) : (
            <GraphVisualization
              nodes={nodes}
              rels={rels}
              focusNodeId={focusNodeId}
              setFocusNodeId={setFocusNodeId}
            />
          )}
        </>

        {/* Comment Box */}
        <form
          className="bg-white rounded-lg shadow absolute bottom-8 right-8 z-10 py-2 px-4 flex flex-col w-[30vw]"
          onSubmit={handleCommentSubmit}
        >
          <label htmlFor="comment" className="font-semibold mb-1 text-gray-700">
            Search for data
          </label>
          <textarea
            id="comment"
            className="border border-gray-200 rounded-md p-2 mb-2 resize-none focus:outline-none focus:ring focus:border-blue-300"
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={handleTextareaKeyDown}
            placeholder="What do you need to find?"
            disabled={loading}
          />
          <button
            type="submit"
            className="bg-blue-600 text-white rounded-lg py-1 px-3 hover:bg-blue-700 transition self-end"
            disabled={loading}
          >
            Submit
          </button>
          {submitting && (
            <span className="text-green-600 mt-1 text-sm">
              Searching for data...
            </span>
          )}
        </form>
      </div>
    </div>
  );
};

export default Home;
