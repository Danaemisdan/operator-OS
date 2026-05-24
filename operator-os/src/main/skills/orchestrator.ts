/**
 * OPERATOR OS — ORCHESTRATOR
 * 
 * The Orchestrator is the brain.
 * 1. Receives a user message
 * 2. Shows the LLM the full skill manifest
 * 3. LLM returns a skill chain (array of steps)
 * 4. Orchestrator executes each step against the real browser
 * 5. Streams activity events back to the UI
 */

import { WebContentsView } from 'electron'
import { LlamaClient } from '../llama-client'
import { SKILL_REGISTRY, getSkill, SkillContext, humanWait } from './registry'
import { tasksDB } from '../tasks-db'
import { queryGraph, addNode, addEdge } from '../knowledge-graph'
import { scheduleTask } from '../scheduler'

export interface ActivityEvent {
  type: 'action' | 'success' | 'error' | 'thinking' | 'info'
  platform?: string
  message: string
  timestamp: number
}

export interface OrchestratorTask {
  id: string
  userMessage: string
  status: 'queued' | 'running' | 'done' | 'failed'
  steps: SkillStep[]
  createdAt: number
  completedAt?: number
  error?: string
}

export interface SkillStep {
  skill: string
  inputs: Record<string, unknown>
  outputs?: Record<string, unknown>
  status: 'pending' | 'running' | 'done' | 'failed'
  error?: string
}

export type ActivityCallback = (event: ActivityEvent) => void
export type TabGetter = (platform: string) => WebContentsView | null
export type TabOpener = (platform: string) => Promise<WebContentsView | null>
export type LoginRequiredCallback = (platform: string) => void

export class Orchestrator {
  private llama: LlamaClient
  private getTab: TabGetter
  private openTab: TabOpener
  private onActivity: ActivityCallback
  private onLoginRequired: LoginRequiredCallback
  private runningTasks: Map<string, OrchestratorTask> = new Map()
  private chatHistory: { role: 'user' | 'assistant', content: string }[] = []

  /** Convenience: generate text with the local LLM */
  private async generateText(prompt: string): Promise<string> {
    return this.llama.chat(
      [{ role: 'user', content: prompt }],
      { maxTokens: 400, temperature: 0.75 }
    )
  }

  constructor(
    llama: LlamaClient,
    getTab: TabGetter,
    openTab: TabOpener,
    onActivity: ActivityCallback,
    onLoginRequired: LoginRequiredCallback = () => {}
  ) {
    this.llama = llama
    this.getTab = getTab
    this.openTab = openTab
    this.onActivity = onActivity
    this.onLoginRequired = onLoginRequired
  }

  private emit(msg: string, type: ActivityEvent['type'] | 'data' = 'info', platform?: string, detail?: string) {
    this.onActivity({ type: type as any, platform, message: msg, timestamp: Date.now(), detail })
  }

  /** Get a view, opening the tab first if needed */
  private async ensureTab(platform: string): Promise<WebContentsView | null> {
    let view = this.getTab(platform)
    if (!view) {
      this.emit(`Opening ${platform} tab...`, 'action', platform)
      view = await this.openTab(platform)
      if (view) {
        // Wait for the page to start loading
        await humanWait(1500, 2500)
      }
    }
    return view
  }

  /**
   * Main entry point. Takes a user message, selects a matching graph workflow, and executes it.
   */
  async run(userMessage: string): Promise<{ taskId: string; reply: string }> {
    const taskId = `task_${Date.now()}`

    this.chatHistory.push({ role: 'user', content: userMessage })
    if (this.chatHistory.length > 10) this.chatHistory = this.chatHistory.slice(-10)

    this.emit(`Classifying intent & consulting memory...`, 'thinking')

    // Quick memory lookup
    let memoryContext = "No memory found."
    try {
      const mem = await queryGraph(userMessage)
      if (mem && mem.nodes.length > 0) {
        memoryContext = JSON.stringify(mem)
      }
    } catch {}

    const workflows = SKILL_REGISTRY.map(s => `- ${s.id}: ${s.description}`).join('\n')

    const prompt = `You are the core autonomous brain of Operator OS.
You must analyze the user's request. 

AVAILABLE WORKFLOWS:
${workflows || 'No workflows available.'}

MEMORY CONTEXT:
${memoryContext}

CAPABILITIES:
1. "CHAT": Just conversational reply.
2. "QUESTION": The user asked for a vague or complex outreach/task, and you MUST ask clarifying questions before proceeding. (e.g. "Send an email to John" -> Ask "What should I say to John?").
3. "SCHEDULE": The user wants to schedule a task or set a reminder for the future.
4. "MEMORY_STORE": The user gave you a fact or contact info to remember.
5. "TASK": The user's request is clear, unambiguous, and matches an AVAILABLE WORKFLOW exactly.

CRITICAL: Do NOT invent workflows. Only use the IDs provided. If a workflow requires inputs (like 'targetUser', 'message') and the user hasn't provided them, you MUST output "QUESTION" and ask them.

Respond ONLY with this JSON format:
{
  "intent": "CHAT" | "QUESTION" | "SCHEDULE" | "MEMORY_STORE" | "TASK",
  "workflowId": "If TASK, the ID of the matched workflow",
  "inputs": { "key": "value" }, // extracted variables for TASK or SCHEDULE
  "reply": "Conversational response, clarifying question, or confirmation.",
  "planExplanation": "If TASK, a human-readable explanation of what you are about to run.",
  "scheduleDelayMs": 0, // If SCHEDULE, delay in milliseconds
  "memoryData": { "label": "", "properties": {} } // If MEMORY_STORE
}`

    const rawResponse = await this.llama.chat([
      { role: 'system', content: prompt },
      ...this.chatHistory,
      { role: 'user', content: userMessage },
      { role: 'system', content: 'Output ONLY valid JSON.' }
    ], { maxTokens: 400, temperature: 0.1, response_format: { type: 'json_object' } })

    let data: any = {}
    try {
      const match = rawResponse.match(/\{[\s\S]*/)
      if (match) {
        data = JSON.parse(match[0].replace(/}[^}]*$/, '}'))
      }
    } catch {
      data = { intent: 'CHAT', reply: "I didn't quite catch that." }
    }

    if (data.intent === 'QUESTION') {
      this.chatHistory.push({ role: 'assistant', content: data.reply })
      return { taskId, reply: data.reply }
    }

    if (data.intent === 'SCHEDULE') {
      const delay = data.scheduleDelayMs || 60000 // default 1 min
      await scheduleTask(userMessage, delay)
      const reply = data.reply || `Scheduled! I will run that in ${Math.round(delay/60000)} minutes.`
      this.chatHistory.push({ role: 'assistant', content: reply })
      return { taskId, reply }
    }

    if (data.intent === 'MEMORY_STORE') {
      if (data.memoryData) {
        await addNode({ label: data.memoryData.label || 'Fact', properties: data.memoryData.properties || {} })
      }
      const reply = data.reply || "I've saved that to my memory graph."
      this.chatHistory.push({ role: 'assistant', content: reply })
      return { taskId, reply }
    }

    if (data.intent === 'CHAT' || !data.workflowId) {
      const reply = data.reply || "I don't have a workflow for that yet. You can build one in the Studio!"
      this.chatHistory.push({ role: 'assistant', content: reply })
      return { taskId, reply }
    }

    const targetSkill = getSkill(data.workflowId)
    if (!targetSkill) {
      const reply = `I couldn't find the workflow: ${data.workflowId}`
      this.chatHistory.push({ role: 'assistant', content: reply })
      return { taskId, reply }
    }

    const planExplanation = data.planExplanation || `I will execute the workflow: ${targetSkill.name}`
    this.chatHistory.push({ role: 'assistant', content: planExplanation })
    this.emit(`**Running Workflow:** ${targetSkill.name}`, 'info')

    // Log the task start
    tasksDB.logTaskStart({
      id: taskId,
      intent: userMessage,
      workflowId: targetSkill.id,
      platform: targetSkill.platform,
      startTime: Date.now(),
      status: 'running'
    })

    const view = await this.ensureTab(targetSkill.platform)
    if (!view) {
      const err = `Could not open tab for platform: ${targetSkill.platform}`
      tasksDB.logTaskEnd(taskId, { status: 'failed', error: err })
      return { taskId, reply: err }
    }

    // Pre-flight login check
    const checkSkill = getSkill(`${targetSkill.platform}.check_login`)
    if (checkSkill) {
      const ctx: SkillContext = {
        view, inputs: {}, log: () => {}, wait: humanWait, evaluate: (js) => view.webContents.executeJavaScript(js),
        extractText: async (selector) => view.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(selector)})?.innerText?.trim() || ''`)
      }
      try {
        const loginResult = await checkSkill.execute(ctx)
        if (loginResult.outputs.loginRequired === true || loginResult.outputs.loginRequired === 'true') {
          this.onLoginRequired(targetSkill.platform)
          tasksDB.logTaskEnd(taskId, { status: 'failed', error: 'Login required' })
          return { taskId, reply: `You're not logged into ${targetSkill.platform}. Please log in and try again.` }
        }
      } catch {}
    }

    this.emit(`Executing workflow: ${targetSkill.name}...`, 'action', targetSkill.platform)

    const ctx: SkillContext = {
      view,
      inputs: { intent: userMessage, ...(data.inputs || {}) },
      log: (msg, type = 'info') => this.emit(msg, type, targetSkill.platform),
      wait: humanWait,
      ai: (prompt, format) => {
        const options: any = { maxTokens: 4000, temperature: 0.1 }
        if (format === 'json') options.response_format = { type: 'json_object' }
        return this.llama.chat([{ role: 'user', content: prompt }], options)
      },
      evaluate: (js) => view.webContents.executeJavaScript(js),
      extractText: async (selector) => {
        return view.webContents.executeJavaScript(
          `document.querySelector(${JSON.stringify(selector)})?.innerText?.trim() || ''`
        )
      }
    }

    try {
      const result = await targetSkill.execute(ctx)
      if (result.success) {
        this.emit(`Workflow completed successfully!`, 'success', targetSkill.platform)
        tasksDB.logTaskEnd(taskId, { 
          status: 'done', 
          outputs: result.outputs,
          extractedDataCount: Object.keys(result.outputs || {}).length
        })
        return { taskId, reply: `Success! Finished running ${targetSkill.name}.` }
      } else {
        this.emit(`Workflow failed: ${result.error}`, 'error', targetSkill.platform)
        tasksDB.logTaskEnd(taskId, { status: 'failed', error: result.error })
        return { taskId, reply: `Execution failed: ${result.error}` }
      }
    } catch (e) {
      this.emit(`Workflow threw an error: ${e}`, 'error', targetSkill.platform)
      tasksDB.logTaskEnd(taskId, { status: 'failed', error: String(e) })
      return { taskId, reply: `Unexpected error: ${String(e)}` }
    }
  }

  getRunningTasks(): OrchestratorTask[] {
    return Array.from(this.runningTasks.values())
  }
}
