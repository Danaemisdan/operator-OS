/**
 * Auto-layout utility for the workflow node graph.
 * Uses dagre (directed acyclic graph) for beautiful, hierarchical node placement.
 * Condition/loop branch nodes are spread horizontally; linear chains are vertical.
 */
import dagre from '@dagrejs/dagre'
import { Node, Edge } from '@xyflow/react'

// Node dimensions for layout calculation (matches CSS widths)
const NODE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  start:          { width: 220, height: 100 },
  eventLoop:      { width: 220, height: 130 },
  eventTimer:     { width: 220, height: 110 },
  eventScheduler: { width: 240, height: 160 },
  action:         { width: 200, height: 200 },
  condition:      { width: 200, height: 180 },
  loop:           { width: 200, height: 150 },
  code:           { width: 200, height: 140 },
  aiTask:         { width: 200, height: 160 },
  default:        { width: 200, height: 180 },
}

const H_SEP = 60  // horizontal separation between nodes
const V_SEP = 80  // vertical separation between ranks

export function autoLayout(nodes: Node[], edges: Edge[]): Node[] {
  if (nodes.length === 0) return nodes

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({
    rankdir: 'TB',    // top-to-bottom
    nodesep: H_SEP,
    ranksep: V_SEP,
    marginx: 60,
    marginy: 60,
    align: 'UL',
  })

  // Add all nodes with their real dimensions
  for (const node of nodes) {
    const dims = NODE_DIMENSIONS[node.type || 'default'] || NODE_DIMENSIONS.default
    g.setNode(node.id, { width: dims.width, height: dims.height })
  }

  // Add all edges
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target)
  }

  // Run layout
  dagre.layout(g)

  // Return updated nodes with new positions
  return nodes.map(node => {
    const layoutNode = g.node(node.id)
    if (!layoutNode) return node
    const dims = NODE_DIMENSIONS[node.type || 'default'] || NODE_DIMENSIONS.default
    return {
      ...node,
      position: {
        x: layoutNode.x - dims.width / 2,
        y: layoutNode.y - dims.height / 2,
      },
    }
  })
}
