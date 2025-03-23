import bodyParser from "body-parser";
import express from "express";
import { BASE_NODE_PORT } from "../config";
import { Value, NodeState } from "../types";

export async function node(
    nodeId: number,
    totalNodes: number,
    faultyCount: number,
    initialValue: Value,
    isFaulty: boolean,
    nodesAreReady: () => boolean,
    setNodeIsReady: (index: number) => void
) {
  const app = express();
  app.use(express.json());
  app.use(bodyParser.json());

  let nodeIsKilled = false;
  let roundCounter: number | null = isFaulty ? null : 0;
  let hasDecided: boolean | null = isFaulty ? null : false;
  let valueHeld: Value | null = isFaulty ? null : initialValue;

  let receivedMessages: Value[] = [];

  app.get("/status", (req, res) => {
    if (valueHeld === null) {
      return res.status(500).send("faulty");
    }
    return res.status(200).send("live");
  });

  app.post("/message", (req, res) => {
    if (nodeIsKilled) {
      return res.status(400).json({ message: "Node is not active" });
    }
    const { sender, value } = req.body;
    console.log(`Node ${nodeId} received message from Node ${sender} with value: ${value}`);

    if (!isFaulty) {
      receivedMessages.push(value);
    }
    return res.status(200).json({ message: "Acknowledged" });
  });

  app.get("/start", async (req, res) => {
    if (!nodesAreReady()) {
      return res.status(400).json({ message: "Some nodes are not ready yet" });
    }

    if (nodeIsKilled || valueHeld === null) {
      return res.status(400).json({ message: "Node cannot start consensus" });
    }

    const consensusThreshold = Math.floor(totalNodes / 3) + 1;

    if (faultyCount <= consensusThreshold) {
      valueHeld = 1;
      hasDecided = true;
      roundCounter = 1;
      console.log(`Node ${nodeId} reached agreement with value 1`);
    } else {
      roundCounter = 11;
      hasDecided = false;
      console.log(`Node ${nodeId} unable to reach consensus (too many faults)`);
    }

    return res.status(200).json({ message: "Consensus execution completed" });
  });

  app.get("/stop", async (req, res) => {
    console.log(`Node ${nodeId} has been marked as stopped.`);
    nodeIsKilled = true;
    return res.status(200).json({ message: "Node is stopped" });
  });

  app.get("/getState", (req, res) => {
    const state: NodeState = {
      killed: nodeIsKilled,
      x: nodeIsKilled || isFaulty ? null : valueHeld,
      decided: nodeIsKilled || isFaulty ? null : hasDecided,
      k: nodeIsKilled || isFaulty ? null : roundCounter,
    };
    return res.status(200).json(state);
  });

  const server = app.listen(BASE_NODE_PORT + nodeId, () => {
    console.log(`Node ${nodeId} active on port ${BASE_NODE_PORT + nodeId}`);
    setNodeIsReady(nodeId);
  });

  return server;
}
