import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs/promises'

export interface GraphNode {
  id: string
  label: string
  properties: Record<string, any>
}

export interface GraphEdge {
  sourceId: string
  targetId: string
  relation: string
  properties?: Record<string, any>
}

export interface KnowledgeGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

const getGraphPath = () => {
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, 'operator-knowledge-graph.json')
}

export async function loadGraph(): Promise<KnowledgeGraph> {
  const graphPath = getGraphPath()
  try {
    const data = await fs.readFile(graphPath, 'utf-8')
    return JSON.parse(data) as KnowledgeGraph
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      const defaultGraph: KnowledgeGraph = { nodes: [], edges: [] }
      await fs.writeFile(graphPath, JSON.stringify(defaultGraph, null, 2), 'utf-8')
      return defaultGraph
    }
    throw err
  }
}

export async function saveGraph(graph: KnowledgeGraph): Promise<void> {
  const graphPath = getGraphPath()
  await fs.writeFile(graphPath, JSON.stringify(graph, null, 2), 'utf-8')
}

export async function addNode(node: Omit<GraphNode, 'id'>): Promise<string> {
  const graph = await loadGraph()
  const id = `node_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
  const newNode = { ...node, id }
  graph.nodes.push(newNode)
  await saveGraph(graph)
  return id
}

export async function addEdge(edge: GraphEdge): Promise<void> {
  const graph = await loadGraph()
  graph.edges.push(edge)
  await saveGraph(graph)
}

export async function queryGraph(query: string): Promise<any> {
  const graph = await loadGraph()
  // Basic substring matching on node properties
  const lowerQuery = query.toLowerCase()
  const matchedNodes = graph.nodes.filter(n => {
    return Object.values(n.properties).some(val => 
      typeof val === 'string' && val.toLowerCase().includes(lowerQuery)
    )
  })

  return {
    nodes: matchedNodes,
    edges: graph.edges.filter(e => 
      matchedNodes.some(n => n.id === e.sourceId || n.id === e.targetId)
    )
  }
}
