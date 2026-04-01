import React, { useEffect, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useNodesState
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';

const NODE_DIMENSIONS = {
  topic: { width: 320, height: 140 },
  round: { width: 430, height: 300 },
  'path-step': { width: 260, height: 120 },
  decision: { width: 430, height: 300 },
  option: { width: 250, height: 150 },
  'branch-run': { width: 340, height: 220 },
  active: { width: 430, height: 300 },
  branch: { width: 250, height: 150 },
  attachment: { width: 250, height: 150 },
  convergence: { width: 360, height: 180 },
  artifact: { width: 320, height: 170 },
  'result-section': { width: 260, height: 160 }
};

function estimateLineCount(text, charsPerLine) {
  const value = String(text || '').trim();
  if (!value) {
    return 0;
  }
  return value
    .split('\n')
    .map((line) => Math.max(1, Math.ceil(line.length / charsPerLine)))
    .reduce((total, count) => total + count, 0);
}

function getNodeDimensions(node) {
  const fallback = NODE_DIMENSIONS[node.type] || { width: 260, height: 140 };
  const data = node && node.data ? node.data : {};
  const bodyLines = estimateLineCount(data.body, node.type === 'active' ? 40 : 30);
  const compact = Boolean(data.compact);

  if (node.type === 'active' || node.type === 'decision' || node.type === 'branch-run' || node.type === 'round') {
    const message = data.message && typeof data.message === 'object' ? data.message : {};
    const options = Array.isArray(message.options) ? message.options : [];
    const optionTextLines = options.reduce((total, option) => (
      total + estimateLineCount(`${option.label || ''} ${option.description || ''}`.trim(), 34)
    ), 0);
    const metaRows = Array.isArray(data.metaPills) && data.metaPills.length > 0
      ? Math.ceil(data.metaPills.length / 3)
      : 0;
    const hasTextOverride = message.questionType === 'ask_text' || message.allowTextOverride;
    const interactiveHeight = message && Object.keys(message).length > 0
      ? (
          (compact ? 120 : 250)
            + (metaRows * (compact ? 28 : 34))
            + (estimateLineCount(data.title, 26) * (compact ? 14 : 18))
            + (bodyLines * (compact ? 12 : 16))
            + (options.length * (compact ? 44 : 62))
            + (optionTextLines * (compact ? 3 : 4))
            + (hasTextOverride ? (compact ? 110 : 170) : 0)
        )
      : (
          (compact ? 120 : 180)
            + (metaRows * 28)
            + (estimateLineCount(data.title, 26) * (compact ? 12 : 16))
            + (bodyLines * (compact ? 12 : 15))
        );
    const height = Math.max(fallback.height, interactiveHeight);

    return {
      width: fallback.width,
      height: Math.min(height, 860)
    };
  }

  if (node.type === 'convergence' || node.type === 'artifact' || node.type === 'result-section') {
    return {
      width: fallback.width,
      height: Math.min(
        Math.max(fallback.height, fallback.height + Math.max(0, bodyLines - 4) * 16),
        420
      )
    };
  }

  return {
    width: fallback.width,
    height: Math.min(
      Math.max(fallback.height, fallback.height + Math.max(0, bodyLines - 3) * 14),
      320
    )
  };
}

function layoutElements(nodes, edges) {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: 'LR',
    nodesep: 34,
    ranksep: 74,
    marginx: 24,
    marginy: 24
  });

  nodes.forEach((node) => {
    const size = getNodeDimensions(node);
    graph.setNode(node.id, size);
  });

  edges.forEach((edge) => {
    graph.setEdge(edge.source, edge.target);
  });

  dagre.layout(graph);

  return nodes.map((node) => {
    const size = getNodeDimensions(node);
    const positioned = graph.node(node.id) || { x: 0, y: 0 };
    return {
      ...node,
      position: {
        x: positioned.x - size.width / 2,
        y: positioned.y - size.height / 2
      },
      style: {
        width: size.width,
        minHeight: size.height
      }
    };
  });
}

function BaseNode({ data, children, selected }) {
  const className = [
    'brainstorm-flow-node',
    `brainstorm-flow-node--${data.kind}`,
    selected ? 'is-selected' : ''
  ].filter(Boolean).join(' ');

  function handleInspect(event) {
    if (!data || typeof data.onInspect !== 'function') {
      return;
    }
    const target = event && event.target && typeof event.target.closest === 'function'
      ? event.target
      : null;
    if (target && target.closest('.brainstorm-flow-node__interactive')) {
      return;
    }
    data.onInspect();
  }

  return (
    <div className={className} onClick={handleInspect}>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <div className="brainstorm-flow-node__badge">{data.badge}</div>
      <h3 className="brainstorm-flow-node__title">{data.title}</h3>
      {data.body ? <p className="brainstorm-flow-node__body">{data.body}</p> : null}
      {children}
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}

function TopicNode(props) {
  return <BaseNode {...props} />;
}

function RoundNode(props) {
  return <DecisionNode {...props} />;
}

function PathStepNode(props) {
  return <BaseNode {...props} />;
}

function DecisionNode({ data, selected }) {
  const hostRef = useRef(null);

  function stopInteractivePropagation(event) {
    event.stopPropagation();
  }

  useEffect(() => {
    if (!hostRef.current || !window.structuredBrainstorming || !data.message) {
      return undefined;
    }
    const host = window.structuredBrainstorming.mountMessageHost(hostRef.current, {
      showMeta: false,
      readOnly: Boolean(data.readOnly),
      compact: Boolean(data.compact),
      onAnswer(answer) {
        if (typeof data.onAnswer === 'function') {
          data.onAnswer(answer);
        }
      }
    });
    host.renderMessage(data.message);
    return () => {
      if (hostRef.current) {
        hostRef.current.innerHTML = '';
      }
    };
  }, [data]);

  return (
    <BaseNode data={data} selected={selected}>
      {data.message ? (
        <div
          className="brainstorm-flow-node__drag-handle"
          title="Drag node"
          aria-label="Drag node"
        >
          Move node
        </div>
      ) : null}
      {data.metaPills && data.metaPills.length > 0 ? (
        <div className="brainstorm-flow-node__meta">
          {data.metaPills.map((pill) => <span key={pill}>{pill}</span>)}
        </div>
      ) : null}
      {data.message ? (
        <div
          ref={hostRef}
          className="brainstorm-flow-node__host brainstorm-flow-node__interactive nodrag"
          onClick={stopInteractivePropagation}
          onMouseDown={stopInteractivePropagation}
          onMouseUp={stopInteractivePropagation}
          onPointerDown={stopInteractivePropagation}
          onPointerUp={stopInteractivePropagation}
        />
      ) : null}
    </BaseNode>
  );
}

function OptionNode(props) {
  return <BaseNode {...props} />;
}

function AttachmentNode(props) {
  return <BaseNode {...props} />;
}

function ConvergenceNode(props) {
  return <BaseNode {...props} />;
}

function ArtifactNode(props) {
  return (
    <BaseNode {...props}>
      {props.data.exportPaths ? (
        <div className="brainstorm-flow-node__actions brainstorm-flow-node__interactive">
          {props.data.exportPaths.markdownPath ? <a href={props.data.exportPaths.markdownPath}>Export Markdown</a> : null}
          {props.data.exportPaths.jsonPath ? <a href={props.data.exportPaths.jsonPath}>Export JSON</a> : null}
        </div>
      ) : null}
    </BaseNode>
  );
}

function ResultSectionNode(props) {
  return <BaseNode {...props} />;
}

function BranchRunNode({ data, selected }) {
  const hostRef = useRef(null);

  function stopInteractivePropagation(event) {
    event.stopPropagation();
  }

  useEffect(() => {
    if (!hostRef.current || !window.structuredBrainstorming || !data.message) {
      return undefined;
    }
    const host = window.structuredBrainstorming.mountMessageHost(hostRef.current, {
      showMeta: false,
      readOnly: Boolean(data.readOnly),
      compact: Boolean(data.compact),
      onAnswer(answer) {
        if (typeof data.onAnswer === 'function') {
          data.onAnswer(answer);
        }
      }
    });
    host.renderMessage(data.message);
    return () => {
      if (hostRef.current) {
        hostRef.current.innerHTML = '';
      }
    };
  }, [data]);

  return (
    <BaseNode data={data} selected={selected}>
      {data.message ? (
        <div
          className="brainstorm-flow-node__drag-handle"
          title="Drag node"
          aria-label="Drag node"
        >
          Move node
        </div>
      ) : null}
      {data.metaPills && data.metaPills.length > 0 ? (
        <div className="brainstorm-flow-node__meta">
          {data.metaPills.map((pill) => <span key={pill}>{pill}</span>)}
        </div>
      ) : null}
      {data.message ? (
        <div
          ref={hostRef}
          className="brainstorm-flow-node__host brainstorm-flow-node__interactive nodrag"
          onClick={stopInteractivePropagation}
          onMouseDown={stopInteractivePropagation}
          onMouseUp={stopInteractivePropagation}
          onPointerDown={stopInteractivePropagation}
          onPointerUp={stopInteractivePropagation}
        />
      ) : null}
    </BaseNode>
  );
}

const nodeTypes = {
  topic: TopicNode,
  round: RoundNode,
  'path-step': PathStepNode,
  decision: DecisionNode,
  option: OptionNode,
  'branch-run': BranchRunNode,
  active: DecisionNode,
  branch: OptionNode,
  attachment: AttachmentNode,
  convergence: ConvergenceNode,
  artifact: ArtifactNode,
  'result-section': ResultSectionNode
};

function ViewportDirector({ graph }) {
  const { fitView, getNodes } = useReactFlow();
  const signature = useMemo(() => JSON.stringify({
    focusNodeId: graph && graph.focusNodeId ? graph.focusNodeId : null,
    selectedNodeId: graph && graph.selectedNodeId ? graph.selectedNodeId : null,
    workspaceMode: graph && graph.workspaceMode ? graph.workspaceMode : 'focused',
    fitNodeIds: Array.isArray(graph && graph.fitNodeIds) ? graph.fitNodeIds : [],
    nodeIds: Array.isArray(graph && graph.nodes) ? graph.nodes.map((node) => node.id) : []
  }), [graph]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const currentNodes = getNodes();
      if (!Array.isArray(currentNodes) || currentNodes.length === 0) {
        return;
      }

      const workspaceMode = graph && graph.workspaceMode === 'overview' ? 'overview' : 'focused';
      const fitNodeIds = Array.isArray(graph && graph.fitNodeIds) && graph.fitNodeIds.length > 0
        ? graph.fitNodeIds
        : currentNodes.map((node) => node.id);
      const fitNodeIdSet = new Set(fitNodeIds);
      const targetNodes = workspaceMode === 'overview'
        ? currentNodes
        : currentNodes.filter((node) => fitNodeIdSet.has(node.id));

      fitView({
        nodes: targetNodes.map((node) => ({ id: node.id })),
        padding: workspaceMode === 'overview'
          ? 0.2
          : { top: '16%', right: '10%', bottom: '16%', left: '12%' },
        minZoom: workspaceMode === 'overview' ? 0.42 : 0.78,
        maxZoom: workspaceMode === 'overview' ? 0.82 : 1.08,
        duration: 260
      });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [fitView, getNodes, signature]);

  return null;
}

function GraphCanvas({ graph, onAnswer, onInspect }) {
  const layoutedNodes = useMemo(() => {
    const rawNodes = Array.isArray(graph && graph.nodes) ? graph.nodes : [];
    const rawEdges = Array.isArray(graph && graph.edges) ? graph.edges : [];
    return layoutElements(rawNodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        onAnswer,
        onInspect: () => onInspect(node.id)
      }
    })), rawEdges);
  }, [graph, onAnswer, onInspect]);

  const edges = useMemo(() => Array.isArray(graph && graph.edges) ? graph.edges : [], [graph]);
  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);

  useEffect(() => {
    setNodes(layoutedNodes);
  }, [layoutedNodes, setNodes]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      nodesDraggable={true}
      nodesConnectable={false}
      elementsSelectable={true}
      minZoom={0.42}
      maxZoom={1.12}
      proOptions={{ hideAttribution: true }}
    >
      <ViewportDirector graph={graph} />
      <Background gap={18} size={1} color="rgba(92,69,56,0.08)" />
      <MiniMap pannable zoomable />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

function BrainstormGraphApp({ graph, onAnswer, onInspect }) {
  return (
    <ReactFlowProvider>
      <GraphCanvas graph={graph} onAnswer={onAnswer} onInspect={onInspect} />
    </ReactFlowProvider>
  );
}

function mountGraphClient(rootEl, props) {
  const root = createRoot(rootEl);
  root.render(<BrainstormGraphApp {...props} />);
  return {
    render(nextProps) {
      root.render(<BrainstormGraphApp {...nextProps} />);
    },
    unmount() {
      root.unmount();
    }
  };
}

export {
  mountGraphClient
};
