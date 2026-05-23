/**
 * OPERATOR OS — SKILL SYSTEM
 * 
 * Skills are atomic browser actions the agent can pick and chain.
 * Each skill: has a clear description (for LLM), typed inputs/outputs,
 * and a simple execute() function that operates on a real browser view.
 * 
 * Adding a new skill = just add it to SKILL_REGISTRY below.
 */

import { WebContentsView } from 'electron'

// ─── Core Types ──────────────────────────────────────────────────────────────

export interface SkillInput {
  name: string
  type: 'string' | 'number' | 'boolean' | 'string[]'
  description: string
  required: boolean
  default?: unknown
}

export interface SkillContext {
  /** The Electron WebContentsView for this platform */
  view: WebContentsView
  /** Resolved input values for this skill invocation */
  inputs: Record<string, unknown>
  /** Emit activity to the UI feed */
  log: (msg: string, type?: 'action' | 'success' | 'error' | 'thinking' | 'info') => void
  /** Human-like wait (randomized delay) */
  wait: (minMs: number, maxMs?: number) => Promise<void>
  /** Call the local LLM to generate text inline during a skill */
  ai?: (prompt: string) => Promise<string>
  /** Get text content from a specific DOM element by selector */
  extractText: (selector: string) => Promise<string>
  /** Execute raw javascript in the browser and return the result */
  evaluate: <T = unknown>(js: string) => Promise<T>
}

export interface SkillResult {
  success: boolean
  /** Data the next skill can use */
  outputs: Record<string, unknown>
  error?: string
}

export interface Skill {
  /** Unique ID — e.g. 'linkedin.send_dm' */
  id: string
  platform: string
  /** Short human name shown in the UI */
  name: string
  /** Description shown to the LLM so it knows when to pick this skill */
  description: string
  /** Natural-language phrases that should trigger this skill (fed to LLM for better intent matching) */
  triggers?: string[]
  inputs: SkillInput[]
  /** What this skill produces (for chaining) */
  outputs: string[]
  execute: (ctx: SkillContext) => Promise<SkillResult>
}

// ─── Browser Helpers ─────────────────────────────────────────────────────────

async function run<T = unknown>(view: WebContentsView, js: string): Promise<T> {
  return view.webContents.executeJavaScript(js)
}

async function waitForSelector(
  view: WebContentsView,
  selector: string,
  timeoutMs = 10000
): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const found = await run<boolean>(
      view,
      `!!document.querySelector(${JSON.stringify(selector)})`
    )
    if (found) return true
    await new Promise(r => setTimeout(r, 500))
  }
  return false
}

async function humanType(view: WebContentsView, selector: string, text: string): Promise<void> {
  // Focus the element
  await run(view, `document.querySelector(${JSON.stringify(selector)})?.focus()`)
  await new Promise(r => setTimeout(r, 200 + Math.random() * 200))
  
  // Type character by character with human-like delays
  for (const char of text) {
    await view.webContents.sendInputEvent({ type: 'char', keyCode: char })
    await new Promise(r => setTimeout(r, 40 + Math.random() * 80))
    // Occasional pause (like thinking)
    if (Math.random() < 0.05) {
      await new Promise(r => setTimeout(r, 300 + Math.random() * 400))
    }
  }
}

async function humanWait(minMs: number, maxMs?: number): Promise<void> {
  // Drastically reduce delays to make the agent super fast (e.g., 10% of the original wait)
  const max = maxMs ?? minMs * 2
  const originalDelay = minMs + Math.random() * (max - minMs)
  const delay = originalDelay * 0.1
  await new Promise(r => setTimeout(r, delay))
}

// ─── REGISTRIES ───────────────────────────────────────────────────────────────

// The LLM reads from the SKILL_REGISTRY (intent-based workflows) to pick skills.
export const SKILL_REGISTRY: Skill[] = []

// The STEP_REGISTRY contains the atomic building blocks executed by the workflows.
export const STEP_REGISTRY: Skill[] = []

// ─── Registry Helpers ─────────────────────────────────────────────────────────

export function getSkill(id: string): Skill | undefined {
  return SKILL_REGISTRY.find(s => s.id === id) || STEP_REGISTRY.find(s => s.id === id)
}

export function getSkillsForPlatform(platform: string): Skill[] {
  return [
    ...SKILL_REGISTRY.filter(s => s.platform === platform),
    ...STEP_REGISTRY.filter(s => s.platform === platform)
  ]
}

/** Returns a super-condensed list of workflow IDs and triggers for Phase 1 RAG routing */
export function getCondensedManifest(userPrompt: string): string {
  // CRITICAL: Return ONLY workflows from SKILL_REGISTRY to serve as reference pipelines.
  const allSkills = SKILL_REGISTRY
  
  const promptTokens = userPrompt.toLowerCase().split(/\W+/).filter(t => t.length > 2)
  
  const scoredSkills = allSkills.map(skill => {
    let score = 0
    // Give base score if the name or description matches keywords
    const descTokens = `${skill.name} ${skill.description} ${skill.id}`.toLowerCase()
    for (const token of promptTokens) {
      if (descTokens.includes(token)) score += 1
    }
    
    // Give massive bonus score for matching explicit triggers
    if (skill.triggers) {
      for (const trigger of skill.triggers) {
        if (userPrompt.toLowerCase().includes(trigger.toLowerCase())) {
          score += 10
        }
      }
    }
    return { skill, score }
  })
  
  // Sort by score descending and take the top 5
  const topK = scoredSkills.sort((a, b) => b.score - a.score).slice(0, 5)
  
  return topK.map(s => {
    const triggers = s.skill.triggers?.length
      ? ` | Triggers: "${s.skill.triggers.join('", "')}"`
      : ''
    return `- ${s.skill.id}${triggers}`
  }).join('\n')
}

/** Returns the detailed schema (description, inputs) for a specific workflow for Phase 2 extraction */
export function getDetailedManifest(id: string): string | null {
  const s = SKILL_REGISTRY.find(skill => skill.id === id) || STEP_REGISTRY.find(skill => skill.id === id)
  if (!s) return null
  
  const inputs = s.inputs.length > 0
    ? `\n  Inputs required:\n` + s.inputs.map(i => `    - ${i.name} (${i.type})${i.required ? ' [REQUIRED]' : ''}: ${i.description}`).join('\n')
    : '\n  Inputs required: None.'
    
  return `WORKFLOW: ${s.id}\nDescription: ${s.description}${inputs}`
}

export function getAtomicManifest(platform?: string): string {
  let steps = STEP_REGISTRY
  if (platform) {
    steps = steps.filter(s => s.platform === platform)
  }
  return steps.map(s => {
    let inputsStr = ''
    if (s.inputs.length > 0) {
      inputsStr = `\n  Inputs: ${s.inputs.map(i => `${i.name} (${i.type})${i.required ? ' [req]' : ''}`).join(', ')}`
    }
    return `- ${s.id}: ${s.description}${inputsStr}`
  }).join('\n')
}

export function getRecordedReferenceWorkflows(): string {
  const fs = require('fs')
  const path = require('path')
  const { app } = require('electron')
  const skillsDir = path.join(app.getPath('userData'), 'operator-os', 'skills')
  
  if (!fs.existsSync(skillsDir)) return ''
  
  const files = fs.readdirSync(skillsDir)
  let allWorkflows = ''
  
  for (const file of files) {
    if (file.endsWith('.md')) {
      const content = fs.readFileSync(path.join(skillsDir, file), 'utf-8')
      allWorkflows += `\n--- RECORDED WORKFLOW: ${file} ---\n${content}\n`
    }
  }
  
  return allWorkflows
}

export { humanWait }
