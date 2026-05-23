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

    this.emit(`Classifying intent...`, 'thinking')

    // Build the manifest of available graph workflows
    const workflows = SKILL_REGISTRY.map(s => `- ${s.id}: ${s.description}`).join('\n')

    const prompt = `You are a strict Graph Workflow Router.
The user has requested a task. You have access to the following predefined graph workflows:
${workflows || 'No workflows available.'}

Analyze the user's request. Does it match the intent of any available workflow?
If it matches, return the workflow ID and any required input variables you can extract from the user's prompt.
If no workflow matches, or the request is just casual chat, set "intent": "CHAT" and reply conversationally.

CRITICAL: Do NOT invent workflows. Only use the IDs provided.

Respond ONLY with this JSON format:
{
  "intent": "CHAT" or "TASK",
  "workflowId": "If TASK, the ID of the matched workflow",
  "inputs": { "key": "value" }, // extracted variables
  "reply": "If CHAT, a brief conversational response.",
  "planExplanation": "If TASK, a human-readable explanation of what you are about to run."
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
    this.emit(`💡 **Running Workflow:** ${targetSkill.name}`, 'info')

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
      return { taskId, reply: `⚠️ ${err}` }
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
          return { taskId, reply: `⚠️ You're not logged into ${targetSkill.platform}. Please log in and try again.` }
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
        this.emit(`✓ Workflow completed successfully!`, 'success', targetSkill.platform)
        tasksDB.logTaskEnd(taskId, { 
          status: 'done', 
          outputs: result.outputs,
          extractedDataCount: Object.keys(result.outputs || {}).length
        })
        return { taskId, reply: `Success! Finished running ${targetSkill.name}.` }
      } else {
        this.emit(`✗ Workflow failed: ${result.error}`, 'error', targetSkill.platform)
        tasksDB.logTaskEnd(taskId, { status: 'failed', error: result.error })
        return { taskId, reply: `⚠️ Execution failed: ${result.error}` }
      }
    } catch (e) {
      this.emit(`✗ Workflow threw an error: ${e}`, 'error', targetSkill.platform)
      tasksDB.logTaskEnd(taskId, { status: 'failed', error: String(e) })
      return { taskId, reply: `⚠️ Unexpected error: ${String(e)}` }
    }
  }

  getRunningTasks(): OrchestratorTask[] {
    return Array.from(this.runningTasks.values())
  }
}
