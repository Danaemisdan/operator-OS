/**
 * LinkedIn DM Operator
 * Full state machine for sending DMs on LinkedIn.
 * Uses deterministic selectors with multi-layer fallback.
 */

import { EventEmitter } from 'events'

// ─── Selector Registry ─────────────────────────────────────────────────────
// Priority order: semantic → text → structural → visual
const SELECTORS = {
  // Navigation
  nav_messaging: [
    '[aria-label="Messaging"]',
    'a[href="/messaging/"]',
    '.global-nav__primary-link[href*="messaging"]',
    'nav a:has-text("Messaging")'
  ],

  // Message box / composer
  message_input: [
    '.msg-form__contenteditable[contenteditable="true"]',
    '[aria-label="Write a message…"]',
    '.msg-form__contenteditable',
    '[data-placeholder="Write a message…"]',
    '.msg-form [contenteditable]'
  ],

  // Send button
  send_button: [
    'button.msg-form__send-button',
    '[aria-label="Send"]',
    'button[type="submit"]:has-text("Send")',
    '.msg-form__send-btn'
  ],

  // Search in messaging
  search_input: [
    '[aria-label="Search messages"]',
    '.msg-connections-filter__search-input',
    'input[placeholder*="Search"]'
  ],

  // Conversation thread
  thread_item: [
    '.msg-conversation-listitem',
    '.msg-conversations-container__conversations li',
    '[data-control-name="conversation"]'
  ],

  // Sent message confirmation
  sent_message: [
    '.msg-s-event-listitem .msg-s-event__content',
    '.msg-s-message-list .msg-s-event-listitem:last-child',
    '[data-test-msg-id]'
  ],

  // Login check
  logged_in: [
    '.global-nav__me',
    '[data-control-name="nav.homepage"]',
    '.global-nav__primary-link[href="/feed/"]'
  ]
}

type DMState =
  | 'IDLE'
  | 'CHECK_LOGIN'
  | 'NAVIGATE_INBOX'
  | 'VERIFY_INBOX'
  | 'SEARCH_RECIPIENT'
  | 'FIND_THREAD'
  | 'OPEN_THREAD'
  | 'VERIFY_THREAD_OPEN'
  | 'COMPOSE_MESSAGE'
  | 'VERIFY_COMPOSED'
  | 'SEND_MESSAGE'
  | 'VERIFY_SENT'
  | 'LOG_AND_DONE'
  | 'DONE'
  | 'FAILED'
  | 'WAITING_FOR_LOGIN'

interface DMJob {
  recipientName: string
  recipientUrl?: string
  message: string
  taskId: string
}

interface StateContext {
  job: DMJob
  retries: number
  lastError?: string
  startedAt: number
  threadUrl?: string
}

type WebContentsExecutor = (script: string) => Promise<unknown>
type ScreenshotFn = () => Promise<Buffer>
type ActivityEmitter = (type: string, message: string, detail?: string) => void

const MAX_RETRIES = 3
const STATE_TIMEOUT = 30000 // 30s per state

export class LinkedInDMOperator extends EventEmitter {
  private state: DMState = 'IDLE'
  private ctx: StateContext | null = null
  private execute: WebContentsExecutor
  private screenshot: ScreenshotFn
  private emitActivity: ActivityEmitter
  private humanBehavior: HumanBehavior

  constructor(
    execute: WebContentsExecutor,
    screenshot: ScreenshotFn,
    emitActivity: ActivityEmitter
  ) {
    super()
    this.execute = execute
    this.screenshot = screenshot
    this.emitActivity = emitActivity
    this.humanBehavior = new HumanBehavior(execute)
  }

  async sendDM(job: DMJob): Promise<{ success: boolean; error?: string }> {
    this.ctx = {
      job,
      retries: 0,
      startedAt: Date.now()
    }

    this.emitActivity('info', `Starting DM to ${job.recipientName}`, job.taskId)

    try {
      await this.runStateMachine()
      return { success: true }
    } catch (e) {
      const error = String(e)
      this.emitActivity('error', `DM failed: ${error}`)
      return { success: false, error }
    }
  }

  private async runStateMachine(): Promise<void> {
    this.transition('CHECK_LOGIN')

    while (this.state !== 'DONE' && this.state !== 'FAILED') {
      await this.executeState()

      // Safety timeout
      if (this.ctx && Date.now() - this.ctx.startedAt > 300000) {
        throw new Error('Workflow timeout: exceeded 5 minutes')
      }
    }

    if (this.state === 'FAILED') {
      throw new Error(this.ctx?.lastError || 'DM workflow failed')
    }
  }

  private async executeState(): Promise<void> {
    switch (this.state) {
      case 'CHECK_LOGIN':
        await this.checkLogin()
        break
      case 'NAVIGATE_INBOX':
        await this.navigateToInbox()
        break
      case 'VERIFY_INBOX':
        await this.verifyInbox()
        break
      case 'SEARCH_RECIPIENT':
        await this.searchRecipient()
        break
      case 'FIND_THREAD':
        await this.findThread()
        break
      case 'OPEN_THREAD':
        await this.openThread()
        break
      case 'VERIFY_THREAD_OPEN':
        await this.verifyThreadOpen()
        break
      case 'COMPOSE_MESSAGE':
        await this.composeMessage()
        break
      case 'VERIFY_COMPOSED':
        await this.verifyComposed()
        break
      case 'SEND_MESSAGE':
        await this.sendMessage()
        break
      case 'VERIFY_SENT':
        await this.verifySent()
        break
      case 'LOG_AND_DONE':
        await this.logAndDone()
        break
      case 'WAITING_FOR_LOGIN':
        await sleep(5000)
        await this.checkLogin()
        break
    }
  }

  // ─── State Handlers ──────────────────────────────────────────────────────

  private async checkLogin(): Promise<void> {
    this.emitActivity('action', 'Checking LinkedIn login status')

    const el = await this.findElement(SELECTORS.logged_in)
    if (el) {
      this.emitActivity('success', 'LinkedIn: logged in ✓')
      this.transition('NAVIGATE_INBOX')
    } else {
      this.emitActivity('info', 'LinkedIn: not logged in — waiting for you to log in')
      this.emit('login-required', { platform: 'linkedin' })
      this.transition('WAITING_FOR_LOGIN')
    }
  }

  private async navigateToInbox(): Promise<void> {
    this.emitActivity('action', 'Navigating to LinkedIn inbox')

    const navEl = await this.findElement(SELECTORS.nav_messaging)
    if (navEl) {
      await this.humanBehavior.click(navEl as string)
      await sleep(randomBetween(1500, 2500))
      this.transition('VERIFY_INBOX')
    } else {
      // Direct URL navigation as fallback
      await this.execute(`window.location.href = 'https://www.linkedin.com/messaging/'`)
      await sleep(randomBetween(2000, 3000))
      this.transition('VERIFY_INBOX')
    }
  }

  private async verifyInbox(): Promise<void> {
    const isInbox = await this.execute(`
      window.location.href.includes('/messaging') ||
      !!document.querySelector('.msg-conversations-container')
    `)

    if (isInbox) {
      this.emitActivity('success', 'Inbox loaded ✓')
      this.transition('SEARCH_RECIPIENT')
    } else {
      await this.retry('Failed to load inbox', 'NAVIGATE_INBOX')
    }
  }

  private async searchRecipient(): Promise<void> {
    if (!this.ctx) return
    const { recipientName, recipientUrl } = this.ctx.job

    this.emitActivity('action', `Searching for ${recipientName}`)

    if (recipientUrl) {
      // If we have a direct URL, we can check if there's an existing thread
      // by navigating to the profile and clicking Message
      await this.execute(`window.location.href = '${recipientUrl}'`)
      await sleep(randomBetween(2000, 3500))
      this.transition('FIND_THREAD')
    } else {
      // Search in messaging search bar
      const searchEl = await this.findElement(SELECTORS.search_input)
      if (searchEl) {
        await this.humanBehavior.type(searchEl as string, recipientName)
        await sleep(randomBetween(1000, 2000))
        this.transition('FIND_THREAD')
      } else {
        await this.retry('Could not find search input', 'SEARCH_RECIPIENT')
      }
    }
  }

  private async findThread(): Promise<void> {
    if (!this.ctx) return
    const { recipientName, recipientUrl } = this.ctx.job

    if (recipientUrl) {
      // On profile page — look for Message button
      const messageBtn = await this.execute(`
        (function() {
          const btns = Array.from(document.querySelectorAll('button, a'))
          const msgBtn = btns.find(el => 
            el.textContent?.trim().match(/^Message$|^Send message$/i) ||
            el.getAttribute('aria-label')?.match(/Message/i)
          )
          return msgBtn ? 'found' : null
        })()
      `)

      if (messageBtn === 'found') {
        this.emitActivity('success', `Found ${recipientName}'s profile ✓`)
        this.transition('OPEN_THREAD')
        return
      }
    }

    // Look in search results
    const thread = await this.execute(`
      (function() {
        const items = document.querySelectorAll(
          '.msg-conversation-listitem, .search-results li'
        )
        for (const item of items) {
          if (item.textContent?.toLowerCase().includes('${recipientName.toLowerCase()}')) {
            return 'found'
          }
        }
        return null
      })()
    `)

    if (thread === 'found') {
      this.emitActivity('success', `Found ${recipientName} ✓`)
      this.transition('OPEN_THREAD')
    } else {
      await this.retry(`Could not find ${recipientName}`, 'SEARCH_RECIPIENT')
    }
  }

  private async openThread(): Promise<void> {
    if (!this.ctx) return
    const { recipientName } = this.ctx.job

    this.emitActivity('action', `Opening conversation with ${recipientName}`)

    // Click message button or conversation item
    const clicked = await this.execute(`
      (function() {
        // Try Message button on profile
        const btns = Array.from(document.querySelectorAll('button, a'))
        const msgBtn = btns.find(el => 
          el.textContent?.trim().match(/^Message$|^Send message$/i)
        )
        if (msgBtn) { msgBtn.click(); return true }
        
        // Try conversation in search results
        const items = document.querySelectorAll('.msg-conversation-listitem')
        for (const item of items) {
          if (item.textContent?.toLowerCase().includes('${recipientName.toLowerCase()}')) {
            item.click()
            return true
          }
        }
        return false
      })()
    `)

    if (clicked) {
      await sleep(randomBetween(1500, 2500))
      this.transition('VERIFY_THREAD_OPEN')
    } else {
      await this.retry('Could not click to open thread', 'OPEN_THREAD')
    }
  }

  private async verifyThreadOpen(): Promise<void> {
    const msgBoxVisible = await this.findElement(SELECTORS.message_input)

    if (msgBoxVisible) {
      this.emitActivity('success', 'Thread opened, message box ready ✓')
      // Simulate reading the conversation history (human behavior)
      await sleep(randomBetween(1000, 3000))
      this.transition('COMPOSE_MESSAGE')
    } else {
      await this.retry('Message box not visible', 'OPEN_THREAD')
    }
  }

  private async composeMessage(): Promise<void> {
    if (!this.ctx) return
    const { message } = this.ctx.job

    this.emitActivity('action', `Composing message (${message.length} chars)`)

    const inputSel = await this.findElement(SELECTORS.message_input)
    if (!inputSel) {
      await this.retry('Message input not found', 'COMPOSE_MESSAGE')
      return
    }

    // Click the input first
    await this.execute(`document.querySelector('${inputSel}')?.click()`)
    await sleep(randomBetween(300, 700))

    // Human-like typing
    await this.humanBehavior.typeIntoContentEditable(inputSel as string, message)

    await sleep(randomBetween(500, 1000))
    this.transition('VERIFY_COMPOSED')
  }

  private async verifyComposed(): Promise<void> {
    if (!this.ctx) return
    const { message } = this.ctx.job

    // Check if text is in the input
    const content = await this.execute(`
      (function() {
        const el = document.querySelector('.msg-form__contenteditable, [contenteditable="true"]')
        return el ? el.textContent?.trim() : ''
      })()
    `)

    if (content && String(content).length > 0) {
      this.emitActivity('success', 'Message composed ✓')
      await sleep(randomBetween(400, 1200)) // Pre-send hesitation
      this.transition('SEND_MESSAGE')
    } else {
      this.ctx.retries++
      await sleep(1000)
      this.transition('COMPOSE_MESSAGE')
    }
  }

  private async sendMessage(): Promise<void> {
    this.emitActivity('action', 'Sending message...')

    // Try keyboard shortcut first (Enter) — most reliable
    const sentViaKeyboard = await this.execute(`
      (function() {
        const input = document.querySelector('.msg-form__contenteditable, [contenteditable="true"]')
        if (!input) return false
        input.focus()
        
        // Dispatch Enter keydown event
        const event = new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
          composed: true
        })
        input.dispatchEvent(event)
        return true
      })()
    `)

    if (!sentViaKeyboard) {
      // Fallback: click send button
      const sendBtn = await this.findElement(SELECTORS.send_button)
      if (sendBtn) {
        await this.humanBehavior.click(sendBtn as string)
      } else {
        await this.retry('Could not send message — no send button found', 'SEND_MESSAGE')
        return
      }
    }

    await sleep(randomBetween(1500, 2500))
    this.transition('VERIFY_SENT')
  }

  private async verifySent(): Promise<void> {
    if (!this.ctx) return

    // Check that message appears in thread
    const sentMsgVisible = await this.execute(`
      (function() {
        const messages = document.querySelectorAll(
          '.msg-s-event-listitem, .msg-s-message-list .msg-s-event-listitem'
        )
        if (messages.length === 0) return false
        const lastMsg = messages[messages.length - 1]
        // Check if it has a sent timestamp (outbound message)
        return !!lastMsg?.querySelector('.msg-s-event__time, time')
      })()
    `)

    if (sentMsgVisible) {
      this.emitActivity('success', `DM sent successfully to ${this.ctx.job.recipientName} ✓`)
      this.transition('LOG_AND_DONE')
    } else {
      // Take screenshot for debugging
      await this.screenshot()
      await this.retry('Message not confirmed in thread', 'SEND_MESSAGE')
    }
  }

  private async logAndDone(): Promise<void> {
    if (!this.ctx) return

    const duration = Date.now() - this.ctx.startedAt
    this.emitActivity('success',
      `DM to ${this.ctx.job.recipientName} complete`,
      `Took ${Math.round(duration / 1000)}s`
    )
    this.emit('dm-sent', this.ctx.job)
    this.transition('DONE')
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private transition(state: DMState): void {
    this.state = state
  }

  private async findElement(selectors: string[]): Promise<string | null> {
    for (const sel of selectors) {
      try {
        const found = await this.execute(`!!document.querySelector(${JSON.stringify(sel)})`)
        if (found) return sel
      } catch { /* ignore */ }
    }
    return null
  }

  private async retry(reason: string, retryState: DMState): Promise<void> {
    if (!this.ctx) return

    this.ctx.retries++
    this.ctx.lastError = reason

    this.emitActivity('error', `${reason} (retry ${this.ctx.retries}/${MAX_RETRIES})`)

    if (this.ctx.retries >= MAX_RETRIES) {
      this.transition('FAILED')
      return
    }

    // Exponential backoff
    await sleep(1000 * Math.pow(2, this.ctx.retries))
    this.transition(retryState)
  }
}

// ─── Human Behavior Engine ────────────────────────────────────────────────

class HumanBehavior {
  private execute: WebContentsExecutor

  constructor(execute: WebContentsExecutor) {
    this.execute = execute
  }

  async click(selector: string): Promise<void> {
    // Pre-click hesitation
    await sleep(randomBetween(80, 200))

    await this.execute(`
      (function() {
        const el = document.querySelector(${JSON.stringify(selector)})
        if (!el) return
        // Move to element (simulated)
        const rect = el.getBoundingClientRect()
        const x = rect.left + rect.width / 2 + (Math.random() - 0.5) * 4
        const y = rect.top + rect.height / 2 + (Math.random() - 0.5) * 4
        
        el.dispatchEvent(new MouseEvent('mouseover', { clientX: x, clientY: y, bubbles: true }))
        el.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y, bubbles: true }))
        el.dispatchEvent(new MouseEvent('mouseup', { clientX: x, clientY: y, bubbles: true }))
        el.click()
      })()
    `)

    await sleep(randomBetween(50, 150))
  }

  async type(selector: string, text: string): Promise<void> {
    await this.execute(`document.querySelector(${JSON.stringify(selector)})?.focus()`)
    await sleep(randomBetween(200, 500))

    for (const char of text) {
      // Occasional typo (2% chance)
      if (Math.random() < 0.02 && char.match(/[a-z]/i)) {
        const wrongChar = nearbyKey(char)
        await this.typeChar(selector, wrongChar)
        await sleep(randomBetween(100, 300))
        await this.execute(`
          const el = document.querySelector(${JSON.stringify(selector)})
          if (el) {
            const len = el.value.length
            el.value = el.value.slice(0, -1)
            el.selectionStart = el.selectionEnd = el.value.length
          }
        `)
        await sleep(randomBetween(150, 400))
      }

      await this.typeChar(selector, char)

      // Variable delay per character (30–140ms = 50–90 WPM)
      await sleep(randomBetween(30, 140))

      // Occasional longer pause (thinking)
      if (Math.random() < 0.05) await sleep(randomBetween(400, 1200))
    }
  }

  async typeIntoContentEditable(selector: string, text: string): Promise<void> {
    await this.execute(`document.querySelector(${JSON.stringify(selector)})?.focus()`)
    await sleep(randomBetween(200, 500))

    for (const char of text) {
      await this.execute(`
        (function() {
          const el = document.querySelector(${JSON.stringify(selector)})
          if (!el) return
          
          const kd = new KeyboardEvent('keydown', { key: ${JSON.stringify(char)}, bubbles: true })
          const kp = new KeyboardEvent('keypress', { key: ${JSON.stringify(char)}, bubbles: true })
          const ku = new KeyboardEvent('keyup', { key: ${JSON.stringify(char)}, bubbles: true })
          
          el.dispatchEvent(kd)
          
          // Insert character
          const sel = window.getSelection()
          if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0)
            range.deleteContents()
            range.insertNode(document.createTextNode(${JSON.stringify(char)}))
            range.collapse(false)
            sel.removeAllRanges()
            sel.addRange(range)
          } else {
            el.textContent = (el.textContent || '') + ${JSON.stringify(char)}
          }
          
          el.dispatchEvent(new Event('input', { bubbles: true }))
          el.dispatchEvent(kp)
          el.dispatchEvent(ku)
        })()
      `)

      await sleep(randomBetween(30, 140))
      if (Math.random() < 0.05) await sleep(randomBetween(400, 1000))
    }
  }

  private async typeChar(selector: string, char: string): Promise<void> {
    await this.execute(`
      (function() {
        const el = document.querySelector(${JSON.stringify(selector)})
        if (!el) return
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        )?.set
        const currentVal = el.value || ''
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(el, currentVal + ${JSON.stringify(char)})
        } else {
          el.value = currentVal + ${JSON.stringify(char)}
        }
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      })()
    `)
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function nearbyKey(char: string): string {
  const nearby: Record<string, string[]> = {
    a: ['s', 'q', 'z'],
    b: ['v', 'n', 'g'],
    c: ['x', 'v', 'd'],
    e: ['w', 'r', 'd'],
    i: ['u', 'o', 'k'],
    n: ['b', 'm', 'h'],
    o: ['i', 'p', 'l'],
    s: ['a', 'd', 'w'],
    t: ['r', 'y', 'g']
  }
  const options = nearby[char.toLowerCase()]
  if (!options) return char
  return options[Math.floor(Math.random() * options.length)]
}
