/**
 * OPERATOR OS — ADVANCED SKILL FILE IMPORTER
 *
 * Loads .skill.json files from the project /skills directory.
 * Compiles declarative step definitions into live Skill objects.
 *
 * Supported step actions:
 *   navigate, wait, waitForLoad, waitForSelector, waitForDOMStable, waitForNavigation
 *   click, type, clear, keypress, hover, select, rightClick
 *   extract, extractAll, extractText, set, log, js
 *   callSkill, aiGenerate, uploadFile, downloadImage, screenshot
 *   if/then/else, foreach
 */

import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { SKILL_REGISTRY, STEP_REGISTRY, getSkill, Skill, SkillContext, SkillResult, humanWait } from './registry'

// ─── Skill File Schema ────────────────────────────────────────────────────────

export interface SkillFileInput {
  name: string
  type: 'string' | 'number' | 'boolean' | 'string[]'
  description: string
  required: boolean
  default?: unknown
}

export type StepAction =
  // ── Navigation ──────────────────────────────────────────────────────
  | { action: 'navigate'; url: string }
  | { action: 'back' }
  | { action: 'reload' }

  // ── Waits ────────────────────────────────────────────────────────────
  /** Fixed ms wait (avoid when possible — use smart waits instead) */
  | { action: 'wait'; ms: number }
  /** Wait for the page's DOMContentLoaded / load event */
  | { action: 'waitForLoad'; timeout?: number }
  /** Wait until a CSS selector exists in the DOM */
  | { action: 'waitForSelector'; selector: string; timeout?: number }
  /** Wait until the DOM stops changing (stable page = no mutations for `ms` ms) */
  | { action: 'waitForDOMStable'; ms?: number; timeout?: number }
  /** Wait until a navigation starts AND finishes */
  | { action: 'waitForNavigation'; timeout?: number }

  // ── Interaction ──────────────────────────────────────────────────────
  | { action: 'click'; selector?: string; text?: string; optional?: boolean }
  /** Use the LLM to find and click an element based on a natural language intent */
  | { action: 'aiClick'; intent: string; optional?: boolean }
  /** Click and drag from one element/coordinate to another */
  | { action: 'drag'; fromSelector?: string; toSelector?: string; from?: {x: number, y: number}; to?: {x: number, y: number}; durationMs?: number }
  | { action: 'rightClick'; selector: string }
  | { action: 'hover'; selector: string }
  | { action: 'doubleClick'; selector: string }
  /** Human-like typing character by character. Set human:false for instant paste. */
  | { action: 'type'; selector: string; value: string; human?: boolean; clear?: boolean }
  | { action: 'clear'; selector: string }
  /** Press a key: 'Return', 'Tab', 'Escape', 'ArrowDown', etc. */
  | { action: 'keypress'; key: string; modifiers?: ('ctrl' | 'shift' | 'alt' | 'meta')[] }
  /** Select an <option> in a <select> by value or visible text */
  | { action: 'select'; selector: string; value: string }
  /** Scroll the page or a container */
  | { action: 'scroll'; direction?: 'up' | 'down' | 'left' | 'right'; amount?: number; selector?: string }
  /** Upload a local file to a file input. filePath can be a variable like {localFile} */
  | { action: 'uploadFile'; selector: string; filePath: string }

  // ── Data Extraction ──────────────────────────────────────────────────
  /** Extract a value from a single element */
  | { action: 'extract'; selector: string; attribute?: string; output: string }
  /** Extract a value from multiple elements and return as array */
  | { action: 'extractAll'; selector: string; fields?: Record<string, string>; output: string; limit?: number | string }
  /** Extract page URL */
  | { action: 'extractUrl'; output: string }
  /** Download/save an image from the page to disk. output = saved file path */
  | { action: 'downloadImage'; selector?: string; url?: string; filename?: string; output?: string }
  /** Read the visible text of the page and verify if a specific goal is met. Fails the step if false unless optional=true */
  | { action: 'aiVerify'; goal: string; optional?: boolean; output?: string; infomatics?: { selector: string; meaning: string }[] }
  /** Read the visible text of the page and answer a question about the current state, outputting the answer as text */
  | { action: 'aiObserve'; question?: string; output?: string; infomatics?: { selector: string; meaning: string }[] }
  | { action: 'code'; code: string; output?: string }
  | { action: 'aiTask'; prompt: string; output?: string }
  | { action: 'condition'; condition: string; conditionType?: string; selector?: string; text?: string; then?: StepAction[]; else?: StepAction[] }
  | { action: 'loop'; arrayVar: string; itemVar?: string; do?: StepAction[] }
  /** Take a screenshot of the current view */
  | { action: 'screenshot'; output?: string }

  // ── Data / Control ───────────────────────────────────────────────────
  | { action: 'set'; key: string; value: unknown }
  | { action: 'log'; message: string; level?: 'action' | 'success' | 'error' | 'thinking' | 'info' }
  | { action: 'js'; code: string; output?: string }
  /** Branch on a variable or interpolated condition */
  | { action: 'if'; condition: string; then: StepAction[]; else?: StepAction[] }
  /** Loop over an array variable */
  | { action: 'foreach'; items: string; as?: string; do: StepAction[] }

  // ── Advanced ─────────────────────────────────────────────────────────
  /** Chain into another registered skill by its ID */
  | { action: 'callSkill'; id: string; inputs?: Record<string, string>; outputAs?: string }
  /**
   * Use the local LLM to generate text.
   * prompt: template string with {varName} interpolation.
   * context: extra variable names to include as context.
   * tone: 'professional' | 'casual' | 'friendly' | 'formal' etc.
   */
  | { action: 'aiGenerate'; prompt: string; context?: string[]; output: string; tone?: string; maxWords?: number }
  /** Read the visible text of the page and extract structured JSON data according to instruction */
  | { action: 'aiExtract'; instruction: string; output: string; infomatics?: { selector: string; meaning: string }[] }
  /** An autonomous agent loop that observes the page and takes actions until the goal is met */
  | { action: 'aiAgent'; goal: string; maxSteps?: number; infomatics?: { selector: string; meaning: string }[] }
  /** Pauses the engine and prompts the user directly via the browser for input */
  | { action: 'askUser'; question: string; output: string }

export interface SkillFileDefinition {
  id: string
  platform: string
  name: string
  description: string
  /** Phrases/intents that should trigger this skill (shown to LLM for better matching) */
  triggers?: string[]
  inputs: SkillFileInput[]
  outputs: string[]
  steps?: StepAction[]
  nodes?: any[]
  edges?: any[]
}

export interface SkillFile {
  version: '1'
  author?: string
  description?: string
  skills: SkillFileDefinition[]
}

// ─── Step Interpreter ─────────────────────────────────────────────────────────

export class StepInterpreter {
  vars: Record<string, unknown>
  private ctx: SkillContext

  constructor(ctx: SkillContext, inputs: Record<string, unknown>) {
    this.ctx = ctx
    this.vars = { ...inputs }
  }

  // Interpolate {varName} and {obj.field} placeholders
  interpolate(template: string): string {
    return String(template).replace(/\{\{?([\w.]+)\}?\}/g, (_, keyPath) => {
      const parts = keyPath.split('.')
      let val: unknown = this.vars
      for (const p of parts) val = (val as Record<string, unknown>)?.[p]
      if (val === undefined || val === null) return `{${keyPath}}`
      if (typeof val === 'object') return JSON.stringify(val)
      return String(val)
    })
  }

  private resolveVal(val: unknown): unknown {
    if (typeof val === 'string') return this.interpolate(val)
    return val
  }

  async run(definition: SkillFileDefinition): Promise<SkillResult> {
    if (definition.nodes && definition.edges) {
      return this.runGraph(definition.nodes, definition.edges)
    }
    
    // Legacy support
    if (definition.steps) {
      for (const step of definition.steps) {
        const result = await this.executeStep(step)
        if (!result.success) return result
      }
    }
    
    return { success: true, outputs: this.vars }
  }

  private async processOutgoingEdges(outEdges: any[], nodes: any[], edges: any[]): Promise<{ success: boolean, nextId: string | null, error?: string }> {
    if (outEdges.length === 0) return { success: true, nextId: null }
    for (let i = 0; i < outEdges.length - 1; i++) {
      const result = await this.runSubgraph(nodes, edges, outEdges[i].target)
      if (!result.success) return { success: false, nextId: null, error: result.error }
    }
    return { success: true, nextId: outEdges[outEdges.length - 1].target }
  }

  async runGraph(nodes: any[], edges: any[]): Promise<SkillResult> {
    const targets = new Set(edges.map(e => e.target))
    let startId = nodes.find(n => !targets.has(n.id))?.id
    if (!startId && nodes.length > 0) startId = nodes[0].id

    if (!startId) return { success: true, outputs: this.vars }
    
    return this.runSubgraph(nodes, edges, startId)
  }

  private async runSubgraph(nodes: any[], edges: any[], startId: string): Promise<SkillResult> {
    const { view, ai } = this.ctx
    const wc = view.webContents

    let currentId: string | null = startId
    let steps = 0

    while (currentId && steps++ < 200) {
      const node = nodes.find(n => n.id === currentId)
      if (!node) break

      const d = node.data || {}

      if (
        node.type === 'start' ||
        node.type === 'eventLoop' ||
        node.type === 'eventScheduler'
      ) {
        // ── Trigger / Start nodes are pass-through during execution ──
        this.ctx.log(`▶ ${node.type === 'start' ? 'Workflow started' : `Trigger: ${node.type}`}`, 'thinking')
        const outEdges = edges.filter(e => e.source === currentId)
        const edgeRes = await this.processOutgoingEdges(outEdges, nodes, edges)
        if (!edgeRes.success) return { success: false, outputs: this.vars, error: edgeRes.error }
        currentId = edgeRes.nextId

      } else if (node.type === 'eventTimer') {
        // ── Timer: actually wait the configured delay ────────────────
        const delay = parseFloat(d.delay || '0')
        const unit = d.unit || 'seconds'
        const ms = unit === 'hours' ? delay * 3600000 : unit === 'minutes' ? delay * 60000 : delay * 1000
        this.ctx.log(`⏱ Timer: waiting ${delay} ${unit}...`, 'thinking')
        await new Promise(r => setTimeout(r, ms))
        const outEdges = edges.filter(e => e.source === currentId)
        const edgeRes = await this.processOutgoingEdges(outEdges, nodes, edges)
        if (!edgeRes.success) return { success: false, outputs: this.vars, error: edgeRes.error }
        currentId = edgeRes.nextId

      } else if (node.type === 'condition' || d.action === 'condition') {
        // ── Evaluate the condition ──────────────────────────────────────
        const conditionType = d.conditionType || 'js'
        let isTrue = false

        try {
          if (conditionType === 'element_exists') {
            const sel = this.interpolate(d.selector || '')
            isTrue = await wc.executeJavaScript(`!!document.querySelector(${JSON.stringify(sel)})`)
          } else if (conditionType === 'text_exists') {
            const txt = this.interpolate(d.text || '')
            isTrue = await wc.executeJavaScript(`document.body?.innerText?.includes(${JSON.stringify(txt)}) || false`)
          } else if (conditionType === 'page_loaded') {
            isTrue = await wc.executeJavaScript(`document.readyState === 'complete'`)
          } else if (conditionType === 'ai') {
            if (!ai) throw new Error('AI not available')
            const goal = this.interpolate(d.goal || '')
            this.ctx.log(`Evaluating AI condition: "${goal}"`, 'thinking')
            const getDomScript = `
              (function() {
                function clean(el) {
                  if (el.nodeType === Node.TEXT_NODE) return el.textContent.trim();
                  if (el.nodeType !== Node.ELEMENT_NODE) return '';
                  const t = el.tagName.toLowerCase();
                  if (['script', 'style', 'svg', 'noscript', 'meta', 'link'].includes(t)) return '';
                  const style = window.getComputedStyle(el);
                  if (style.display === 'none' || style.visibility === 'hidden') return '';
                  let text = Array.from(el.childNodes).map(clean).filter(Boolean).join(' ').trim();
                  const aria = el.getAttribute('aria-label') || el.getAttribute('title') || '';
                  return text || aria;
                }
                return clean(document.body).replace(/\\s{2,}/g, ' ').slice(0, 8000);
              })()
            `;
            const pageText = await wc.executeJavaScript(getDomScript)
            const prompt = `You are an AI Verifier. Your job is to check if the current webpage state meets the following goal: "${goal}".\n\nPAGE TEXT:\n${pageText}\n\nDoes the page meet the goal? Answer ONLY with "true" or "false".`
            const resultStr = (await ai(prompt)).trim().toLowerCase()
            isTrue = resultStr.includes('true')
          } else {
            const expr = this.interpolate(d.condition || 'true')
            const varKeys = Object.keys(this.vars)
            const varVals = varKeys.map(k => this.vars[k])
            isTrue = Boolean(new Function(...varKeys, `return (${expr})`).apply(null, varVals))
          }
        } catch (e) {
          this.ctx.log(`⚠ Condition eval failed: ${String(e)}`, 'error')
          isTrue = false
        }

        this.ctx.log(`⑂ Condition [${conditionType}] → ${isTrue ? 'TRUE ✓' : 'FALSE ✗'}`, 'thinking')

        const outEdges = edges.filter(e => e.source === currentId && e.sourceHandle === (isTrue ? 'true' : 'false'))
        const edgeRes = await this.processOutgoingEdges(outEdges, nodes, edges)
        if (!edgeRes.success) return { success: false, outputs: this.vars, error: edgeRes.error }
        currentId = edgeRes.nextId
        
      } else if (node.type === 'loop' || d.action === 'loop') {
        // ── Execute the Loop ───────────────────────────────────────────
        const arrayVarName = (d.arrayVar || '').replace(/[{}]/g, '').trim()
        const arr = this.vars[arrayVarName]
        const itemVarName = d.itemVar || 'item'
        
        const eachEdge = edges.find(e => e.source === currentId && e.sourceHandle === 'each')
        const doneEdge = edges.find(e => e.source === currentId && e.sourceHandle === 'done')

        if (Array.isArray(arr) && arr.length > 0 && eachEdge) {
          this.ctx.log(`⟳ Loop over ${arr.length} items from ${arrayVarName}`, 'thinking')
          for (let i = 0; i < arr.length; i++) {
            this.vars[itemVarName] = arr[i]
            this.ctx.log(`  ↪ Iteration ${i+1}/${arr.length} (${itemVarName})`, 'thinking')
            const result = await this.runSubgraph(nodes, edges, eachEdge.target)
            if (!result.success) return result
          }
        } else {
          this.ctx.log(`⟳ Loop skipped (not an array or no items)`, 'thinking')
        }

        const doneEdges = edges.filter(e => e.source === currentId && e.sourceHandle === 'done')
        const edgeRes = await this.processOutgoingEdges(doneEdges, nodes, edges)
        if (!edgeRes.success) return { success: false, outputs: this.vars, error: edgeRes.error }
        currentId = edgeRes.nextId
        
      } else {
        // ── Execute the action step ────────────────────────────────────
        const stepData: any = { ...d }
        
        // Remap UI action names to interpreter action names
        if (stepData.action === 'set_variable') {
          stepData.action = 'set'
          stepData.key = stepData.output || stepData.key
        } else if (stepData.action === 'store_data') {
          stepData.action = 'storeData'
          stepData.collection = stepData.targetName
        } else if (stepData.action === 'call_workflow') {
          stepData.action = 'callSkill'
          stepData.id = stepData.targetName
          try {
            stepData.inputs = JSON.parse(stepData.value || '{}')
          } catch {
            stepData.inputs = {}
          }
          stepData.outputAs = stepData.output
        }

        if (stepData.action === 'navigate' && stepData.url) stepData.url = this.interpolate(stepData.url)
        if (stepData.selector) stepData.selector = this.interpolate(stepData.selector)
        if (stepData.value) stepData.value = this.interpolate(String(stepData.value))
        if (stepData.key && stepData.action !== 'set') stepData.key = stepData.key // keep as-is for set

        const result = await this.executeStep(stepData)

        if (result.outputs) Object.assign(this.vars, result.outputs)
        if (!result.success) return result

        const outEdges = edges.filter(e => e.source === currentId)
        const edgeRes = await this.processOutgoingEdges(outEdges, nodes, edges)
        if (!edgeRes.success) return { success: false, outputs: this.vars, error: edgeRes.error }
        currentId = edgeRes.nextId
      }
    }

    return { success: true, outputs: this.vars }
  }


  private async executeStep(step: StepAction): Promise<SkillResult> {
    const { view, log, ai } = this.ctx
    const wc = view.webContents

    try {
      switch (step.action) {

        // ── Navigation ────────────────────────────────────────────────
        case 'navigate': {
          const url = this.interpolate(step.url)
          log(`→ ${url}`, 'action')
          await wc.loadURL(url)
          // Wait for page to start rendering
          await this.waitForLoad(wc, 8000)
          break
        }

        case 'back':
          wc.goBack()
          await this.waitForLoad(wc, 5000)
          break

        case 'reload':
          wc.reload()
          await this.waitForLoad(wc, 8000)
          break

        // ── Smart Waits ───────────────────────────────────────────────
        case 'wait':
          await humanWait(step.ms, step.ms * 1.2)
          break

        case 'waitForLoad': {
          const ok = await this.waitForLoad(wc, step.timeout ?? 15000)
          if (!ok) return { success: false, outputs: this.vars, error: 'Page load timed out' }
          break
        }

        case 'waitForSelector': {
          const sel = this.interpolate(step.selector)
          const found = await waitForSel(view, sel, step.timeout ?? 15000)
          if (!found) return { success: false, outputs: this.vars, error: `Timeout waiting for: ${sel}` }
          break
        }

        case 'waitForDOMStable': {
          await this.waitForDOMStable(wc, step.ms ?? 600, step.timeout ?? 10000)
          break
        }

        case 'waitForNavigation': {
          await this.waitForNavigation(wc, step.timeout ?? 10000)
          break
        }

        // ── Interaction ───────────────────────────────────────────────
        case 'click': {
          if (step.selector) {
            const sel = this.interpolate(step.selector)
            const clicked = await wc.executeJavaScript(`
              (function() {
                const el = document.querySelector(${JSON.stringify(sel)});
                if (!el) return false;
                el.scrollIntoView({ block: 'center', behavior: 'smooth' });
                el.click();
                return true;
              })()
            `)
            if (!clicked && !step.optional) {
              return { success: false, outputs: this.vars, error: `Element not found: ${sel}` }
            }
          } else if (step.text) {
            const text = this.interpolate(step.text)
            await wc.executeJavaScript(`
              (function() {
                const candidates = 'button, a, [role="button"], [role="menuitem"], span, li';
                const el = Array.from(document.querySelectorAll(candidates))
                  .find(e => e.innerText?.trim() === ${JSON.stringify(text)});
                if (el) { el.scrollIntoView({ block: 'center' }); el.click(); }
              })()
            `)
          }
          await humanWait(300, 700)
          break
        }

        case 'aiClick': {
          if (!ai) return { success: false, outputs: this.vars, error: 'AI not available for aiClick' }
          const intent = this.interpolate(step.intent)
          log(`Finding element for intent: "${intent}"...`, 'thinking')

          // Extract interactive elements from the DOM
          const elements = await wc.executeJavaScript(`
            (function() {
              const els = Array.from(document.querySelectorAll('button, a, input, select, textarea, [role="button"], [role="menuitem"], [role="link"], [tabindex]:not([tabindex="-1"])'));
              return els
                .filter(e => {
                  const r = e.getBoundingClientRect();
                  return r.width > 0 && r.height > 0 && window.getComputedStyle(e).visibility !== 'hidden';
                })
                .map((e, idx) => {
                  e.setAttribute('data-operator-idx', idx); // Tag it so we can click it later
                  return {
                    idx,
                    tag: e.tagName.toLowerCase(),
                    text: (e.innerText || e.value || e.getAttribute('aria-label') || '').trim().substring(0, 100),
                    type: e.type || e.getAttribute('role') || ''
                  };
                })
                .filter(e => e.text.length > 0); // Only keep ones with some descriptive text
            })()
          `)

          if (!elements.length) {
            if (step.optional) return { success: true, outputs: this.vars }
            return { success: false, outputs: this.vars, error: 'No interactive elements found on page' }
          }

          const elementsList = elements.map((e: any) => `[${e.idx}] <${e.tag}${e.type ? ` type="${e.type}"` : ''}>: "${e.text}"`).join('\n')
          
          const prompt = `You are a web automation agent. The user wants to click an element matching this intent:\n"${intent}"\n\nHere are the visible interactive elements on the page:\n\n${elementsList}\n\nWhich element index best matches the intent? Reply with ONLY the integer index (e.g. 5) and absolutely no other text. If none match, reply with -1.`
          
          const reply = await ai(prompt)
          const idx = parseInt(reply.trim(), 10)

          if (isNaN(idx) || idx === -1) {
            if (step.optional) return { success: true, outputs: this.vars }
            return { success: false, outputs: this.vars, error: `AI could not find an element matching intent: ${intent}` }
          }

          const clicked = await wc.executeJavaScript(`
            (function() {
              const el = document.querySelector('[data-operator-idx="${idx}"]');
              if (el) {
                el.scrollIntoView({ block: 'center', behavior: 'smooth' });
                el.click();
                return true;
              }
              return false;
            })()
          `)

          if (!clicked) {
            if (step.optional) return { success: true, outputs: this.vars }
            return { success: false, outputs: this.vars, error: `Failed to click element at index ${idx}` }
          }
          
          log(`Clicked element matching "${intent}" ✓`, 'success')
          await humanWait(300, 700)
          break
        }

        case 'drag': {
          let startX = 0, startY = 0, endX = 0, endY = 0

          // Resolve start coordinates
          if (step.fromSelector) {
            const sel = this.interpolate(step.fromSelector)
            const rect = await wc.executeJavaScript(`
              (function() {
                const el = document.querySelector(${JSON.stringify(sel)});
                if (!el) return null;
                const r = el.getBoundingClientRect();
                return { x: r.left + r.width/2, y: r.top + r.height/2 };
              })()
            `)
            if (!rect) return { success: false, outputs: this.vars, error: `Drag start element not found: ${sel}` }
            startX = rect.x; startY = rect.y
          } else if (step.from) {
            startX = step.from.x; startY = step.from.y
          }

          // Resolve end coordinates
          if (step.toSelector) {
            const sel = this.interpolate(step.toSelector)
            const rect = await wc.executeJavaScript(`
              (function() {
                const el = document.querySelector(${JSON.stringify(sel)});
                if (!el) return null;
                const r = el.getBoundingClientRect();
                return { x: r.left + r.width/2, y: r.top + r.height/2 };
              })()
            `)
            if (!rect) return { success: false, outputs: this.vars, error: `Drag end element not found: ${sel}` }
            endX = rect.x; endY = rect.y
          } else if (step.to) {
            endX = step.to.x; endY = step.to.y
          }

          log(`Dragging from ${startX},${startY} to ${endX},${endY}`, 'action')

          const durationMs = step.durationMs ?? 500
          const steps = Math.max(5, Math.floor(durationMs / 16)) // ~60fps
          
          // Mouse Down
          await wc.sendInputEvent({ type: 'mouseDown', x: startX, y: startY, button: 'left', clickCount: 1 } as any)
          await humanWait(50, 100)
          
          // Mouse Move (interpolate)
          for (let i = 1; i <= steps; i++) {
            const progress = i / steps
            const currX = startX + (endX - startX) * progress
            const currY = startY + (endY - startY) * progress
            await wc.sendInputEvent({ type: 'mouseMove', x: Math.round(currX), y: Math.round(currY) } as any)
            await new Promise(r => setTimeout(r, durationMs / steps))
          }
          
          // Mouse Up
          await wc.sendInputEvent({ type: 'mouseUp', x: endX, y: endY, button: 'left', clickCount: 1 } as any)
          await humanWait(200, 500)
          break
        }

        case 'rightClick': {
          const sel = this.interpolate(step.selector)
          await wc.executeJavaScript(`
            (function() {
              const el = document.querySelector(${JSON.stringify(sel)});
              if (el) el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
            })()
          `)
          break
        }

        case 'hover': {
          const sel = this.interpolate(step.selector)
          await wc.executeJavaScript(`
            (function() {
              const el = document.querySelector(${JSON.stringify(sel)});
              if (el) {
                el.scrollIntoView({ block: 'center' });
                el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
                el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
              }
            })()
          `)
          await humanWait(300, 600)
          break
        }

        case 'doubleClick': {
          const sel = this.interpolate(step.selector)
          await wc.executeJavaScript(`
            document.querySelector(${JSON.stringify(sel)})?.dispatchEvent(
              new MouseEvent('dblclick', { bubbles: true })
            )
          `)
          break
        }

        case 'type': {
          const sel = this.interpolate(step.selector)
          const text = this.interpolate(step.value)

          // Optionally clear first
          if (step.clear !== false) {
            await wc.executeJavaScript(`
              (function() {
                const el = document.querySelector(${JSON.stringify(sel)});
                if (!el) return;
                el.focus();
                if (el.value !== undefined) el.value = '';
                else if (el.contentEditable === 'true') el.textContent = '';
                el.dispatchEvent(new Event('input', { bubbles: true }));
              })()
            `)
            await humanWait(100, 200)
          }

          await wc.executeJavaScript(
            `document.querySelector(${JSON.stringify(sel)})?.focus()`
          )
          await humanWait(150, 350)

          if (step.human !== false) {
            // Human-like: character by character with variable speed
            for (const char of text) {
              await wc.sendInputEvent({ type: 'char', keyCode: char })
              await humanWait(30, 100)
              if (Math.random() < 0.04) await humanWait(300, 900) // thinking pause
            }
          } else {
            // Fast: set value directly via native setter
            await wc.executeJavaScript(`
              (function() {
                const el = document.querySelector(${JSON.stringify(sel)});
                if (!el) return;
                const nativeSetter =
                  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set ||
                  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
                if (nativeSetter) nativeSetter.call(el, ${JSON.stringify(text)});
                else el.value = ${JSON.stringify(text)};
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
              })()
            `)
          }
          break
        }

        case 'clear': {
          const sel = this.interpolate(step.selector)
          await wc.executeJavaScript(`
            (function() {
              const el = document.querySelector(${JSON.stringify(sel)});
              if (!el) return;
              el.focus();
              if (el.value !== undefined) el.value = '';
              else if (el.contentEditable === 'true') el.textContent = '';
              el.dispatchEvent(new Event('input', { bubbles: true }));
            })()
          `)
          break
        }

        case 'keypress': {
          const mods = step.modifiers ?? []
          await wc.sendInputEvent({
            type: 'keyDown',
            keyCode: step.key,
            modifiers: mods as string[]
          } as Parameters<typeof wc.sendInputEvent>[0])
          await humanWait(50, 100)
          await wc.sendInputEvent({
            type: 'keyUp',
            keyCode: step.key,
            modifiers: mods as string[]
          } as Parameters<typeof wc.sendInputEvent>[0])
          await humanWait(150, 400)
          break
        }

        case 'select': {
          const sel = this.interpolate(step.selector)
          const val = this.interpolate(step.value)
          await wc.executeJavaScript(`
            (function() {
              const el = document.querySelector(${JSON.stringify(sel)});
              if (!el) return;
              // Try matching by value first, then by visible text
              const opt = Array.from(el.options || []).find(
                o => o.value === ${JSON.stringify(val)} || o.text?.trim() === ${JSON.stringify(val)}
              );
              if (opt) {
                el.value = opt.value;
                el.dispatchEvent(new Event('change', { bubbles: true }));
              }
            })()
          `)
          break
        }

        case 'scroll': {
          const amount = (step.amount ?? 3) * 400
          if (step.selector) {
            const sel = this.interpolate(step.selector)
            await wc.executeJavaScript(`
              (function() {
                const el = document.querySelector(${JSON.stringify(sel)});
                if (el) el.scrollBy(0, ${step.direction === 'up' ? -amount : amount});
              })()
            `)
          } else {
            const dx = step.direction === 'left' ? -amount : step.direction === 'right' ? amount : 0
            const dy = step.direction === 'up' ? -amount : step.direction === 'down' ? amount : amount
            await wc.executeJavaScript(`window.scrollBy(${dx}, ${dy})`)
          }
          await humanWait(400, 800)
          break
        }

        case 'uploadFile': {
          const sel = this.interpolate(step.selector)
          const filePath = this.interpolate(step.filePath)
          log(`Uploading file: ${path.basename(filePath)}`, 'action')

          // Use Chrome DevTools Protocol to set file on input element
          const dbg = wc.debugger
          let attached = false
          try {
            dbg.attach('1.3')
            attached = true
            const { root } = await dbg.sendCommand('DOM.getDocument')
            const { nodeId } = await dbg.sendCommand('DOM.querySelector', {
              nodeId: root.nodeId,
              selector: sel
            })
            if (nodeId !== 0) {
              await dbg.sendCommand('DOM.setFileInputFiles', {
                nodeId,
                files: [filePath]
              })
              log(`File set on input ✓`, 'success')
            } else {
              return { success: false, outputs: this.vars, error: `File input not found: ${sel}` }
            }
          } finally {
            if (attached) try { dbg.detach() } catch { /* already detached */ }
          }
          await humanWait(500, 1000)
          break
        }

        // ── Data Extraction ───────────────────────────────────────────
        case 'extract': {
          const sel = this.interpolate(step.selector)
          const attr = step.attribute ?? 'innerText'
          
          if (step.isList) {
            const limit = step.maxResults ? (parseInt(step.maxResults) || 100) : 100;
            const results = await wc.executeJavaScript(`
              (function() {
                const els = Array.from(document.querySelectorAll(${JSON.stringify(sel)})).slice(0, ${limit});
                return els.map(el => {
                  if (${JSON.stringify(attr)} === 'innerText') return el.innerText?.trim() || '';
                  if (${JSON.stringify(attr)} === 'href') return el.href || el.getAttribute('href') || '';
                  if (${JSON.stringify(attr)} === 'src') return el.src || el.getAttribute('src') || '';
                  if (${JSON.stringify(attr)} === 'html') return el.innerHTML;
                  return el.getAttribute(${JSON.stringify(attr)}) || '';
                });
              })()
            `);
            this.vars[step.output] = results
            log(`Extracted list of ${results?.length || 0} items → ${step.output}`, 'info')
          } else {
            const val = await wc.executeJavaScript(`
              (function() {
                const el = document.querySelector(${JSON.stringify(sel)});
                if (!el) return null;
                if (${JSON.stringify(attr)} === 'innerText') return el.innerText?.trim() || '';
                if (${JSON.stringify(attr)} === 'href') return el.href || el.getAttribute('href') || '';
                if (${JSON.stringify(attr)} === 'src') return el.src || el.getAttribute('src') || '';
                if (${JSON.stringify(attr)} === 'html') return el.innerHTML;
                return el.getAttribute(${JSON.stringify(attr)}) || '';
              })()
            `)
            this.vars[step.output] = val
            log(`Got ${step.output}: ${String(val ?? '(null)').slice(0, 80)}`, 'info')
          }
          break
        }

        case 'extractAll': {
          const sel = this.interpolate(step.selector)
          const fields = step.fields ?? {}
          const limitRaw = step.limit
          const limit = limitRaw !== undefined
            ? (typeof limitRaw === 'string'
              ? Number(this.vars[limitRaw] ?? limitRaw)
              : limitRaw)
            : 100

          const results = await wc.executeJavaScript(`
            (function() {
              const els = Array.from(document.querySelectorAll(${JSON.stringify(sel)})).slice(0, ${limit});
              const fields = ${JSON.stringify(fields)};
              return els.map(el => {
                const item = {
                  text: el.innerText?.trim() || '',
                  href: el.href || el.getAttribute('href') || '',
                  src: el.src || el.getAttribute('src') || ''
                };
                for (const [key, sub] of Object.entries(fields)) {
                  const subEl = el.querySelector(sub.split('@')[0]);
                  const subAttr = sub.includes('@') ? sub.split('@')[1] : 'innerText';
                  item[key] = subEl
                    ? (subAttr === 'innerText' ? subEl.innerText?.trim() : subEl.getAttribute(subAttr)) || ''
                    : '';
                }
                return item;
              });
            })()
          `)
          this.vars[step.output] = results
          log(`Extracted ${(results as unknown[]).length} items → ${step.output}`, 'info')
          break
        }

        case 'extractUrl': {
          this.vars[step.output] = await wc.executeJavaScript(`window.location.href`)
          break
        }

        case 'downloadImage': {
          const imgUrl = step.url
            ? this.interpolate(step.url)
            : await wc.executeJavaScript(`
                document.querySelector(${JSON.stringify(this.interpolate(step.selector ?? 'img'))})?.src || ''
              `)

          if (!imgUrl) {
            return { success: false, outputs: this.vars, error: 'No image URL found' }
          }

          const savePath = path.join(
            app.getPath('downloads'),
            step.filename ? this.interpolate(step.filename) : `operator-image-${Date.now()}.jpg`
          )

          // Download via fetch inside the webcontents (shares cookies/session)
          const b64: string = await wc.executeJavaScript(`
            fetch(${JSON.stringify(imgUrl)})
              .then(r => r.arrayBuffer())
              .then(buf => {
                let b = '';
                new Uint8Array(buf).forEach(b_ => b += String.fromCharCode(b_));
                return btoa(b);
              })
          `)
          fs.writeFileSync(savePath, Buffer.from(b64, 'base64'))
          log(`Image saved → ${savePath}`, 'success')
          if (step.output) this.vars[step.output] = savePath
          break
        }

        case 'screenshot': {
          const img = await wc.capturePage()
          const savePath = path.join(
            app.getPath('downloads'),
            `operator-screenshot-${Date.now()}.png`
          )
          fs.writeFileSync(savePath, img.toPNG())
          log(`Screenshot saved → ${savePath}`, 'info')
          if (step.output) this.vars[step.output] = savePath
          break
        }

        // ── Data / Control ────────────────────────────────────────────
        case 'set':
          this.vars[step.key] = this.resolveVal(step.value)
          break

        case 'storeData': {
          const col = this.interpolate(step.collection)
          const dataToStore = this.resolveVal(step.value)
          const storePath = path.join(app.getPath('userData'), `store_${col}.json`)
          let existing: any[] = []
          try {
            if (fs.existsSync(storePath)) {
              existing = JSON.parse(fs.readFileSync(storePath, 'utf8'))
            }
          } catch (e) {
            log(`Failed to read store: ${String(e)}`, 'error')
          }
          const entry = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            data: dataToStore
          }
          existing.push(entry)
          fs.writeFileSync(storePath, JSON.stringify(existing, null, 2))
          log(`Data saved to store [${col}]`, 'success')
          break
        }

        case 'callSkill': {
          const skillId = this.interpolate(step.id)
          const inputs = step.inputs || {}
          for (const k of Object.keys(inputs)) inputs[k] = this.interpolate(inputs[k])
          
          const targetSkill = getSkill(skillId)
          if (!targetSkill) return { success: false, outputs: this.vars, error: `Skill not found: ${skillId}` }
          
          log(`Calling skill: ${skillId}`, 'info')
          const subImporter = new StepInterpreter({ ...this.ctx, inputs })
          const subResult = await subImporter.run(targetSkill)
          
          if (!subResult.success) return { success: false, outputs: this.vars, error: `Sub-skill failed: ${subResult.error}` }
          
          if (step.outputAs) {
            this.vars[step.outputAs] = subResult.outputs
          } else {
            Object.assign(this.vars, subResult.outputs)
          }
          break
        }

        case 'log':
          log(this.interpolate(step.message), step.level ?? 'info')
          break

        case 'js': {
          const code = this.interpolate(step.code)
          const result = await wc.executeJavaScript(`(function(){${code}})()`)
          if (step.output) this.vars[step.output] = result
          break
        }

        case 'if': {
          const raw = step.condition.replace(/^\{|\}$/g, '')
          let condVal: unknown = this.vars[raw] ?? this.interpolate(step.condition)
          const truthy = condVal && condVal !== 'false' && condVal !== '0' && condVal !== ''
          const branch = truthy ? step.then : (step.else ?? [])
          const r = await this.runBranch(branch)
          if (!r.success) return r
          break
        }

        case 'foreach': {
          const key = step.items.replace(/^\{|\}$/g, '')
          const items = this.vars[key] as unknown[]
          if (!Array.isArray(items)) break
          const alias = step.as ?? 'item'
          let idx = 0
          for (const item of items) {
            this.vars[alias] = item
            this.vars[`${alias}Index`] = idx++
            const r = await this.runBranch(step.do)
            if (!r.success) return r
            await humanWait(600, 1800)
          }
          delete this.vars[alias]
          break
        }

        case 'askUser': {
          const question = this.interpolate(step.question)
          log(`Waiting for user input: "${question}"`, 'thinking')
          const safeQuestion = question.replace(/"/g, '\\"').replace(/\n/g, '\\n')
          const answer = await wc.executeJavaScript(`prompt("${safeQuestion}", "")`)
          
          if (answer === null) {
             return { success: false, outputs: this.vars, error: 'User cancelled the prompt' }
          }
          
          this.vars[step.output] = answer
          log(`User answered: "${answer}"`, 'info')
          break
        }

        // ── Advanced ──────────────────────────────────────────────────
        case 'callSkill': {
          const skill = getSkill(step.id)
          if (!skill) {
            return { success: false, outputs: this.vars, error: `Skill or Step not found: ${step.id}` }
          }
          log(`↳ calling skill: ${skill.name}`, 'thinking')

          // Resolve inputs for the sub-skill
          const resolvedInputs: Record<string, unknown> = {}
          for (const [k, v] of Object.entries(step.inputs ?? {})) {
            resolvedInputs[k] = this.interpolate(v)
          }
          // Carry defaults
          for (const inp of skill.inputs) {
            if (!(inp.name in resolvedInputs) && inp.default !== undefined) {
              resolvedInputs[inp.name] = inp.default
            }
          }

          const subCtx: SkillContext = {
            ...this.ctx,
            inputs: resolvedInputs
          }
          const result = await skill.execute(subCtx)
          if (!result.success) return result

          // Merge outputs into current scope
          if (step.outputAs) {
            this.vars[step.outputAs] = result.outputs
          } else {
            Object.assign(this.vars, result.outputs)
          }
          break
        }

        case 'aiGenerate': {
          if (!ai) {
            return { success: false, outputs: this.vars, error: 'AI not available in this context' }
          }

          // Build a rich prompt from template + context vars
          const basePrompt = this.interpolate(step.prompt)
          const contextLines: string[] = []
          for (const key of (step.context ?? [])) {
            const val = this.vars[key]
            if (val !== undefined) contextLines.push(`${key}: ${JSON.stringify(val)}`)
          }

          const toneInstruction = step.tone
            ? `Write in a ${step.tone} tone.`
            : 'Write in a natural, human tone.'
          const lengthInstruction = step.maxWords
            ? `Keep it under ${step.maxWords} words.`
            : ''

          const fullPrompt = [
            toneInstruction,
            lengthInstruction,
            contextLines.length ? `Context:\n${contextLines.join('\n')}` : '',
            `Task: ${basePrompt}`,
            'Reply with ONLY the generated text, nothing else.'
          ].filter(Boolean).join('\n\n')

          log(`AI generating: ${step.output}...`, 'thinking')
          const generated = await ai(fullPrompt)
          this.vars[step.output] = generated.trim()
          log(`Generated ${step.output} (${generated.trim().length} chars)`, 'info')
          break
        }

        case 'aiExtract': {
          if (!ai) return { success: false, outputs: this.vars, error: 'AI not available' }
          const instruction = this.interpolate(step.instruction)
          const outputKey = step.output || 'extracted'
          log(`Extracting data: "${instruction}"...`, 'thinking')
          const infomatics = step.infomatics || [];
          const getDomScript = `
            (function() {
              const infomatics = ${JSON.stringify(infomatics)};
              function clean(el) {
                if (el.nodeType === Node.TEXT_NODE) return el.textContent.trim();
                if (el.nodeType !== Node.ELEMENT_NODE) return '';
                const t = el.tagName.toLowerCase();
                if (['script', 'style', 'svg', 'noscript', 'meta', 'link', 'path', 'iframe'].includes(t)) return '';
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden') return '';
                let text = Array.from(el.childNodes).map(clean).filter(Boolean).join(' ').trim();
                
                const aria = el.getAttribute('aria-label') || el.getAttribute('title') || '';
                let label = text || aria;
                
                for (const info of infomatics) {
                  try {
                    if (el.matches && el.matches(info.selector)) {
                      label += ' (Action: ' + info.meaning + ')';
                      break;
                    }
                  } catch(e) {}
                }
                
                if (!label && !el.href) return '';
                if (t === 'a' && el.href) return '[' + label + '](' + el.href.split('?')[0] + ')';
                if (t === 'button' || el.getAttribute('role') === 'button') return '<button>' + label + '</button>';
                if (t === 'input') return '<input type="' + el.type + '" placeholder="' + (el.placeholder||'') + '" value="' + (el.value||'') + '">';
                if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(t)) return '\\n# ' + label + '\\n';
                if (t === 'li') return '\\n- ' + label;
                return label;
              }
              return clean(document.body).replace(/\\s{2,}/g, ' ').slice(0, 8000);
            })()
          `;
          const pageText = await wc.executeJavaScript(getDomScript)
          const prompt = `You are a web scraper. Extract data from the following webpage structured text according to this instruction: "${instruction}".\nReturn ONLY a valid JSON object or array. Do not include markdown code blocks or any other text.\n\nPAGE TEXT:\n${pageText}`
          
          let resultStr = await ai(prompt, 'json')
          try {
            // Clean up markdown code blocks if the LLM hallucinated them
            if (resultStr.includes('\`\`\`json')) {
              resultStr = resultStr.split('\`\`\`json')[1].split('\`\`\`')[0].trim();
            } else if (resultStr.includes('\`\`\`')) {
              resultStr = resultStr.split('\`\`\`')[1].split('\`\`\`')[0].trim();
            }
            
            // Robustly find the first and last JSON bracket/brace
            const startObj = resultStr.indexOf('{');
            const startArr = resultStr.indexOf('[');
            const startIdx = Math.min(startObj !== -1 ? startObj : Infinity, startArr !== -1 ? startArr : Infinity);
            
            const endObj = resultStr.lastIndexOf('}');
            const endArr = resultStr.lastIndexOf(']');
            const endIdx = Math.max(endObj, endArr);
            
            if (startIdx !== Infinity && endIdx !== -1 && endIdx >= startIdx) {
              resultStr = resultStr.substring(startIdx, endIdx + 1);
            }

            const parsed = JSON.parse(resultStr)
            this.vars[outputKey] = parsed
            log(`Extracted structured data into "${outputKey}"`, 'success')
          } catch(e) {
            log(`AI failed to parse JSON. Raw output: ${resultStr}`, 'error')
            return { success: false, outputs: this.vars, error: 'Invalid JSON returned by AI' }
          }
          break
        }

        case 'aiVerify': {
          if (!ai) return { success: false, outputs: this.vars, error: 'AI not available' }
          const goal = this.interpolate(step.goal)
          log(`Verifying goal: "${goal}"...`, 'thinking')
          const infomatics = step.infomatics || [];
          const getDomScript = `
            (function() {
              const infomatics = ${JSON.stringify(infomatics)};
              function clean(el) {
                if (el.nodeType === Node.TEXT_NODE) return el.textContent.trim();
                if (el.nodeType !== Node.ELEMENT_NODE) return '';
                const t = el.tagName.toLowerCase();
                if (['script', 'style', 'svg', 'noscript', 'meta', 'link', 'path', 'iframe'].includes(t)) return '';
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden') return '';
                let text = Array.from(el.childNodes).map(clean).filter(Boolean).join(' ').trim();
                
                const aria = el.getAttribute('aria-label') || el.getAttribute('title') || '';
                let label = text || aria;
                
                for (const info of infomatics) {
                  try {
                    if (el.matches && el.matches(info.selector)) {
                      label += ' (Action: ' + info.meaning + ')';
                      break;
                    }
                  } catch(e) {}
                }
                
                if (!label && !el.href) return '';
                if (t === 'a' && el.href) return '[' + label + '](' + el.href.split('?')[0] + ')';
                if (t === 'button' || el.getAttribute('role') === 'button') return '<button>' + label + '</button>';
                if (t === 'input') return '<input type="' + el.type + '" placeholder="' + (el.placeholder||'') + '" value="' + (el.value||'') + '">';
                if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(t)) return '\\n# ' + label + '\\n';
                if (t === 'li') return '\\n- ' + label;
                return label;
              }
              return clean(document.body).replace(/\\s{2,}/g, ' ').slice(0, 8000);
            })()
          `;
          const pageText = await wc.executeJavaScript(getDomScript)
          const prompt = `You are an AI Verifier. Your job is to check if the current webpage state meets the following goal: "${goal}".\n\nPAGE TEXT:\n${pageText}\n\nDoes the page meet the goal? Answer ONLY with "true" or "false".`
          const resultStr = (await ai(prompt, 'text')).trim().toLowerCase()
          
          if (resultStr.includes('true')) {
            log(`Goal verified: ${goal}`, 'success')
            if (step.output) this.vars[step.output] = true
          } else {
            log(`Goal NOT met: ${goal}`, 'error')
            if (step.output) this.vars[step.output] = false
            if (!step.optional) {
              return { success: false, outputs: this.vars, error: `Verification failed: ${goal}` }
            }
          }
          break
        }

        case 'code': {
          try {
            const expr = this.interpolate(step.code || '')
            const varKeys = Object.keys(this.vars)
            const varVals = varKeys.map(k => this.vars[k])
            
            // Provide a wrapper to execute multi-line or return-based code
            const fnBody = expr.includes('return ') ? expr : `return (${expr})`
            const fn = new Function(...varKeys, fnBody)
            
            const result = fn.apply(null, varVals)
            
            if (step.output) {
              this.vars[step.output] = result
            }
            log(`Executed code block successfully`, 'info')
          } catch (err) {
            log(`Code block failed: ${err}`, 'error')
            return { success: false, outputs: this.vars, error: `Code execution failed: ${err}` }
          }
          break
        }

        case 'aiTask': {
          if (!ai) return { success: false, outputs: this.vars, error: 'AI not available' }
          const prompt = this.interpolate(step.prompt || '')
          log(`Executing AI Task...`, 'thinking')
          
          try {
            const resultStr = (await ai(prompt, 'text')).trim()
            if (step.output) {
              this.vars[step.output] = resultStr
            }
            log(`AI Task completed`, 'success')
          } catch (err) {
            log(`AI Task failed: ${err}`, 'error')
            return { success: false, outputs: this.vars, error: `AI Task failed: ${err}` }
          }
          break
        }

        case 'aiObserve': {
          if (!ai) return { success: false, outputs: this.vars, error: 'AI not available' }
          const question = this.interpolate(step.question || 'What is on this page and what state is it in?')
          const outputKey = step.output || 'observation'
          log(`Observing page: "${question}"...`, 'thinking')
          const infomatics = step.infomatics || [];
          const getDomScript = `
            (function() {
              const infomatics = ${JSON.stringify(infomatics)};
              function clean(el) {
                if (el.nodeType === Node.TEXT_NODE) return el.textContent.trim();
                if (el.nodeType !== Node.ELEMENT_NODE) return '';
                const t = el.tagName.toLowerCase();
                if (['script', 'style', 'svg', 'noscript', 'meta', 'link', 'path', 'iframe'].includes(t)) return '';
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden') return '';
                let text = Array.from(el.childNodes).map(clean).filter(Boolean).join(' ').trim();
                
                const aria = el.getAttribute('aria-label') || el.getAttribute('title') || '';
                let label = text || aria;
                
                for (const info of infomatics) {
                  try {
                    if (el.matches && el.matches(info.selector)) {
                      label += ' (Action: ' + info.meaning + ')';
                      break;
                    }
                  } catch(e) {}
                }
                
                if (!label && !el.href) return '';
                if (t === 'a' && el.href) return '[' + label + '](' + el.href.split('?')[0] + ')';
                if (t === 'button' || el.getAttribute('role') === 'button') return '<button>' + label + '</button>';
                if (t === 'input') return '<input type="' + el.type + '" placeholder="' + (el.placeholder||'') + '" value="' + (el.value||'') + '">';
                if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(t)) return '\\n# ' + label + '\\n';
                if (t === 'li') return '\\n- ' + label;
                return label;
              }
              return clean(document.body).replace(/\\s{2,}/g, ' ').slice(0, 8000);
            })()
          `;
          const pageText = await wc.executeJavaScript(getDomScript)
          const prompt = `You are an AI Observer. Answer the following question about the current webpage state concisely based ONLY on the provided text.\nQuestion: "${question}"\n\nPAGE TEXT:\n${pageText}\n\nRespond with a concise text answer.`
          const resultStr = (await ai(prompt, 'text')).trim()
          this.vars[outputKey] = resultStr
          log(`Observation: ${resultStr.substring(0, 100)}...`, 'info')
          break
        }

        case 'aiAgent': {
          if (!ai) return { success: false, outputs: this.vars, error: 'AI not available' }
          const goal = this.interpolate(step.goal)
          const maxSteps = step.maxSteps || 5
          const infomatics = step.infomatics || [];
          
          log(`Starting aiAgent loop for goal: "${goal}"`, 'thinking')
          
          for (let i = 0; i < maxSteps; i++) {
            const getDomScript = `
              (function() {
                const infomatics = ${JSON.stringify(infomatics)};
                let counter = 0;
                function clean(el) {
                  if (el.nodeType === Node.TEXT_NODE) return el.textContent.trim();
                  if (el.nodeType !== Node.ELEMENT_NODE) return '';
                  const t = el.tagName.toLowerCase();
                  if (['script', 'style', 'svg', 'noscript', 'meta', 'link', 'path', 'iframe'].includes(t)) return '';
                  const style = window.getComputedStyle(el);
                  if (style.display === 'none' || style.visibility === 'hidden') return '';
                  let text = Array.from(el.childNodes).map(clean).filter(Boolean).join(' ').trim();
                  
                  const aria = el.getAttribute('aria-label') || el.getAttribute('title') || '';
                  let label = text || aria;
                  
                  for (const info of infomatics) {
                    try { if (el.matches && el.matches(info.selector)) { label += ' (Action: ' + info.meaning + ')'; break; } } catch(e) {}
                  }
                  
                  if (!label && !el.href) return '';
                  
                  if (t === 'a' || t === 'button' || t === 'input' || el.getAttribute('role') === 'button') {
                    const idx = counter++;
                    el.setAttribute('data-agent-idx', idx);
                    if (t === 'a') return '[' + idx + '] [' + label + '](' + el.href.split('?')[0] + ')';
                    if (t === 'button' || el.getAttribute('role') === 'button') return '[' + idx + '] <button>' + label + '</button>';
                    if (t === 'input') return '[' + idx + '] <input type="' + el.type + '" placeholder="' + (el.placeholder||'') + '" value="' + (el.value||'') + '">';
                  }
                  
                  if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(t)) return '\\n# ' + label + '\\n';
                  if (t === 'li') return '\\n- ' + label;
                  return label;
                }
                return clean(document.body).replace(/\\s{2,}/g, ' ').slice(0, 8000);
              })()
            `;
            const pageText = await wc.executeJavaScript(getDomScript);
            
            const prompt = `You are an autonomous web agent. Your overall goal is: "${goal}".\n\nPAGE STATE:\n${pageText}\n\nDecide the next action to take. Choose from:\n- {"command": "click", "idx": <number>}\n- {"command": "type", "idx": <number>, "value": "<text to type>"}\n- {"command": "scroll", "direction": "down"}\n- {"command": "done"}\n\nRespond ONLY with valid JSON.`;
            
            const reply = await ai(prompt, 'json');
            let cmd;
            try {
               let resultStr = reply;
               if (resultStr.includes('\`\`\`json')) resultStr = resultStr.split('\`\`\`json')[1].split('\`\`\`')[0].trim();
               else if (resultStr.includes('\`\`\`')) resultStr = resultStr.split('\`\`\`')[1].split('\`\`\`')[0].trim();
               const startObj = resultStr.indexOf('{');
               const endObj = resultStr.lastIndexOf('}');
               if (startObj !== -1 && endObj !== -1) resultStr = resultStr.substring(startObj, endObj + 1);
               cmd = JSON.parse(resultStr);
            } catch(e) {
               log('Agent failed to output valid JSON command. Retrying...', 'error');
               continue;
            }
            
            log(`Agent decided: ${JSON.stringify(cmd)}`, 'action');
            
            if (cmd.command === 'done') {
               log(`Agent achieved goal: ${goal}`, 'success');
               break;
            } else if (cmd.command === 'click' && cmd.idx !== undefined) {
               await wc.executeJavaScript(`
                 (function() {
                   const el = document.querySelector('[data-agent-idx="${cmd.idx}"]');
                   if (el) { el.scrollIntoView({block: 'center'}); el.click(); }
                 })()
               `);
               await humanWait(1000, 2000);
            } else if (cmd.command === 'type' && cmd.idx !== undefined && cmd.value) {
               await wc.executeJavaScript(`
                 (function() {
                   const el = document.querySelector('[data-agent-idx="${cmd.idx}"]');
                   if (el) { 
                     el.scrollIntoView({block: 'center'}); 
                     el.focus();
                     el.value = ""; 
                     el.value = "${cmd.value}";
                     el.dispatchEvent(new Event('input', { bubbles: true }));
                     el.dispatchEvent(new Event('change', { bubbles: true }));
                   }
                 })()
               `);
               await humanWait(1000, 2000);
            } else if (cmd.command === 'scroll') {
               await wc.executeJavaScript(`window.scrollBy(0, window.innerHeight * 0.8)`);
               await humanWait(1000, 2000);
            }
            
            await this.waitForDOMStable(wc, 1000, 5000);
          }
          break
        }

        default:
          log(`Unknown step action: ${(step as { action: string }).action}`, 'error')
      }

      return { success: true, outputs: this.vars }
    } catch (e) {
      return { success: false, outputs: this.vars, error: String(e) }
    }
  }

  private async runBranch(steps: StepAction[]): Promise<SkillResult> {
    const savedVars = { ...this.vars }
    const sub = new StepInterpreter(this.ctx, this.vars)
    sub.vars = this.vars // share vars (mutations propagate up)
    const r = await sub.run(steps)
    this.vars = sub.vars
    return r
  }

  // ── Smart Wait Helpers ─────────────────────────────────────────────

  private waitForLoad(
    wc: Electron.WebContents,
    timeoutMs: number
  ): Promise<boolean> {
    return new Promise(resolve => {
      if (!wc.isLoading()) return resolve(true)

      const timer = setTimeout(() => { wc.removeListener('did-finish-load', onLoad); resolve(false) }, timeoutMs)
      const onLoad = () => { clearTimeout(timer); resolve(true) }
      wc.once('did-finish-load', onLoad)
    })
  }

  private waitForNavigation(
    wc: Electron.WebContents,
    timeoutMs: number
  ): Promise<boolean> {
    return new Promise(resolve => {
      const timer = setTimeout(() => { wc.removeListener('did-navigate', onNav); resolve(false) }, timeoutMs)
      const onNav = () => { clearTimeout(timer); resolve(true) }
      wc.once('did-navigate', onNav)
    })
  }

  private async waitForDOMStable(
    wc: Electron.WebContents,
    stableMs: number,
    timeoutMs: number
  ): Promise<void> {
    // Override stableMs to be much faster (e.g. max 150ms instead of 1000+ms)
    const fastStableMs = Math.min(stableMs, 150);
    await wc.executeJavaScript(`
      new Promise(resolve => {
        let hardTimeout = setTimeout(() => {
          if (obs) obs.disconnect();
          resolve(false);
        }, ${timeoutMs});
        
        let timer = setTimeout(() => {
          clearTimeout(hardTimeout);
          if (obs) obs.disconnect();
          resolve(true);
        }, ${fastStableMs});
        
        const obs = new MutationObserver(() => {
          clearTimeout(timer);
          timer = setTimeout(() => {
            clearTimeout(hardTimeout);
            obs.disconnect();
            resolve(true);
          }, ${fastStableMs});
        });
        
        obs.observe(document.body, { childList: true, subtree: true, attributes: true });
      })
    `).catch(() => {}) // Ignore any execution errors
  }
}

// ─── Selector wait helper ─────────────────────────────────────────────────────

async function waitForSel(
  view: import('electron').WebContentsView,
  selector: string,
  timeoutMs: number
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const found: boolean = await view.webContents.executeJavaScript(
      `!!document.querySelector(${JSON.stringify(selector)})`
    )
    if (found) return true
    await new Promise(r => setTimeout(r, 400))
  }
  return false
}

// ─── Compiler: SkillFileDefinition → Skill ───────────────────────────────────

function compileSkill(def: SkillFileDefinition): Skill {
  // If the skill has a graph, extract the top-level intent from the start node
  let extractedIntent = def.description
  if (def.nodes) {
    const startNode = def.nodes.find(n => n.type === 'start')
    if (startNode && startNode.data && startNode.data.intent) {
      extractedIntent = startNode.data.intent
    }
  }

  return {
    id: def.id,
    platform: def.platform,
    name: def.name,
    description: extractedIntent,
    triggers: def.triggers,
    inputs: def.inputs,
    outputs: def.outputs,
    async execute(ctx: SkillContext): Promise<SkillResult> {
      // Apply defaults
      const resolvedInputs = { ...ctx.inputs }
      for (const inp of def.inputs) {
        if (!(inp.name in resolvedInputs) && inp.default !== undefined) {
          resolvedInputs[inp.name] = inp.default
        }
      }

      const interpreter = new StepInterpreter(ctx, resolvedInputs)
      const result = await interpreter.run(def)

      // Return only declared outputs
      const out: Record<string, unknown> = {}
      for (const key of def.outputs) {
        if (key in result.outputs) out[key] = result.outputs[key]
      }
      return { ...result, outputs: out }
    }
  }
}

// ─── File Loader ──────────────────────────────────────────────────────────────

export function loadSkillFile(filePath: string, isStep: boolean = false): { loaded: number; errors: string[] } {
  const errors: string[] = []
  let loaded = 0
  const targetRegistry = isStep ? STEP_REGISTRY : SKILL_REGISTRY

  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    const file: SkillFile = JSON.parse(raw)

    if (!Array.isArray(file.skills)) {
      errors.push(`${filePath}: "skills" must be an array`)
      return { loaded, errors }
    }

    for (const def of file.skills) {
      if (!def.id || !def.platform || !def.steps) {
        errors.push(`Skill missing required fields: ${def.id ?? '(no id)'}`)
        continue
      }

      // Hot-reload: remove existing skill with same ID
      const idx = targetRegistry.findIndex(s => s.id === def.id)
      if (idx !== -1) targetRegistry.splice(idx, 1)

      targetRegistry.push(compileSkill(def))
      loaded++
      console.log(`[Skills] ✓ ${def.id}${def.triggers?.length ? ` (${def.triggers.length} triggers)` : ''}`)
    }
  } catch (e) {
    errors.push(`Failed to load ${path.basename(filePath)}: ${String(e)}`)
  }

  return { loaded, errors }
}

/** Scan the project /skills folder and load all .skill.json files into SKILL_REGISTRY */
export function loadUserSkillsDir(): void {
  // app.getAppPath() always returns the directory containing package.json
  const skillsDir = path.join(app.getAppPath(), 'skills')

  if (!fs.existsSync(skillsDir)) {
    fs.mkdirSync(skillsDir, { recursive: true })
    console.log(`[Skills] Created: ${skillsDir}`)
    console.log(`[Skills] Drop .skill.json files there to add custom skills.`)
    return
  }

  const files = fs.readdirSync(skillsDir).filter(f => f.endsWith('.skill.json'))
  if (!files.length) {
    console.log(`[Skills] No .skill.json files in ${skillsDir}`)
    return
  }

  for (const file of files) {
    const { loaded, errors } = loadSkillFile(path.join(skillsDir, file), false)
    if (errors.length) console.warn('[Skills]', errors)
    else console.log(`[Skills] Loaded ${loaded} workflow(s) from ${file}`)
  }
}

/** Scan the project /steps folder and load all .json files into STEP_REGISTRY */
export function loadUserStepsDir(): void {
  const stepsDir = path.join(app.getAppPath(), 'steps')

  if (!fs.existsSync(stepsDir)) {
    fs.mkdirSync(stepsDir, { recursive: true })
    console.log(`[Steps] Created: ${stepsDir}`)
    return
  }

  const getAllFiles = (dir: string): string[] => {
    let results: string[] = []
    const list = fs.readdirSync(dir)
    list.forEach(file => {
      const fullPath = path.join(dir, file)
      const stat = fs.statSync(fullPath)
      if (stat && stat.isDirectory()) {
        results = results.concat(getAllFiles(fullPath))
      } else if (file.endsWith('.json')) {
        results.push(fullPath)
      }
    })
    return results
  }

  const files = getAllFiles(stepsDir)
  if (!files.length) {
    console.log(`[Steps] No .json files in ${stepsDir}`)
    return
  }

  for (const file of files) {
    const { loaded, errors } = loadSkillFile(file, true)
    if (errors.length) console.warn('[Steps]', errors)
    else console.log(`[Steps] Loaded ${loaded} step(s) from ${path.relative(stepsDir, file)}`)
  }
}

export { compileSkill }
