import { NextResponse } from "next/server";
import { getNeo4jSession } from "@/lib/neo4j";
import { GoogleGenAI } from "@google/genai";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// graphRAG hyperparameters
const K = 5;
const EP = 0.02;

const ai = new GoogleGenAI({
  vertexai: true, 
  project: process.env.PROJECT,
  location:process.env.LOCATION,
});

const vectorize = async (content) => {
  const response = await ai.models.embedContent({
    // model: "gemini-embedding-exp-03-07",
    // model: "gemini-embedding-001",
    model: process.env.EMBEDDING_MODEL,
    contents: content,
    config: {
      taskType: "SEMANTIC_SIMILARITY",
      outputDimensionality: 768,
    },
  });
  return response.embeddings[0].values;
};

// const gemini = async (content, context) => {
//   const response = await ai.models.generateContent({
//     model: "gemini-2.0-flash",
//     contents: `
//       You are assisting a user trying to find data tables in a data warehouse.
//       This is their message: ${content}

//       We have determined that the following tables and columns may be relevant.
//       Please select a set of tables that are most relevant for addressing the user's need.
//       Keep the list as short as possible.
//       Do not suggest tables not listed.
//       Your choices are listed here:

//       ${context}
//       `,
//   });
//   return response.text;
// };

const getQueryAndParams = async ({ option, params }) => {
  switch (option) {
    case "init":
      return {
        query: `
          MATCH (n:Schema)
          WITH collect(n) AS nodes
          RETURN
            [n IN nodes | {
              id: n.id + "_" + apoc.text.join(labels(n), "_"),
              description: n.description,
              labels: labels(n),
              captions: [{value: n.description}]
            }] AS nodes,
            [] AS rels
        `,
        params: {},
      };
    case "node-expand":
      // expects params.nodeId
      return {
        query: `
          WITH split($nodeId, "_") AS parts
          MATCH (n:$(parts[1..]) {id: toInteger(parts[0])})
          MATCH (n)<-[r:IN_SCHEMA|IN_COGROUP|IN]-(m)
          WITH collect(m) AS nodes, collect(r) AS rels
          RETURN
            [node IN nodes | {
              id: coalesce(node.id + "_" + apoc.text.join(labels(node), "_"), node.table_name + "__" + node.name),
              description: coalesce(node.description, node.table_name + "__" + node.name),
              labels: labels(node),
              captions: [{value: coalesce(node.description, node.table_name + "__" + node.name)}]
            }] AS nodes,
            [r IN rels | {
              id: elementId(r),
              from: coalesce(startNode(r).id + "_" + apoc.text.join(labels(startNode(r)), "_"), startNode(r).table_name + "__" + startNode(r).name),
              to: coalesce(endNode(r).id + "_" + apoc.text.join(labels(endNode(r)), "_"), endNode(r).table_name + "__" + endNode(r).name),
              captions: [{value: type(r)}]
            }] AS rels
          `,
        params: { nodeId: params.nodeId },
      };
    case "graph-rag":
      // expects params.content
      const vector = await vectorize(params.content);
      return {
        query: `
          CALL db.index.vector.queryNodes('schemaDescriptions', $k, $vector)
          YIELD node, score
          WITH node AS schema, score
          MATCH path = (schema)<-[:IN_SCHEMA]-(c:Component)<-[:IN_COGROUP]-()<-[:IN*0..1]-(col:Column)<-[:HAS_COLUMN]-(t:Table)
          WHERE vector.similarity.cosine($vector, c.embedding) > score - $ep
          WITH collect(nodes(path)) AS nodeList, collect(relationships(path)) AS relList
          WITH
            apoc.coll.toSet(apoc.coll.flatten(nodeList)) AS nodes,
            apoc.coll.toSet(apoc.coll.flatten(relList)) AS rels
          RETURN
            [node IN nodes | {
              id: coalesce(node.id + "_" + apoc.text.join(labels(node), "_"), node.table_name + "__" + node.name, node.name),
              description: coalesce(node.description, node.table_name + "__" + node.name, node.name),
              labels: labels(node),
              captions: [{value: coalesce(node.description, node.table_name + "__" + node.name, node.name)}]
            }] AS nodes,
            [r IN rels | {
              id: elementId(r),
              from: coalesce(startNode(r).id + "_" + apoc.text.join(labels(startNode(r)), "_"), startNode(r).table_name + "__" + startNode(r).name, startNode(r).name),
              to: coalesce(endNode(r).id + "_" + apoc.text.join(labels(endNode(r)), "_"), endNode(r).table_name + "__" + endNode(r).name, endNode(r).name),
              captions: [{value: type(r)}]
            }] AS rels
        `,
        params: { vector, k: K, ep: EP },
      };
    // Add more options here...
    default:
      throw new Error("Invalid option");
  }
};

const GET = async (request) => {
  const neo4jSession = getNeo4jSession();
  const { searchParams } = new URL(request.url);
  const option = searchParams.get("option") || "init";
  const nodeId = searchParams.get("nodeId");
  const content = searchParams.get("content");
  console.log("Content:", content);

  try {
    const { query, params } = await getQueryAndParams({
      option,
      params: { nodeId, content },
    });

    const queryResult = await neo4jSession.run(query, params);
    if (!queryResult || queryResult.records.length === 0) {
      return NextResponse.json({ nodes: [], rels: [] });
    }

    const result = queryResult.records.map((record) => ({
      nodes: record.get("nodes"),
      rels: record.get("rels"),
    }))[0];

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json({ error: "An error occurred" }, { status: 500 });
  } finally {
    neo4jSession.close();
  }
};

export { GET };
