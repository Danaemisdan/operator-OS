import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

export interface CampaignState {
  id: string
  platform: string
  type: string
  target: string
  payload: Record<string, any>
  status: 'pending_wait' | 'condition_met' | 'completed' | 'failed'
  createdAt: number
  lastChecked: number
  nextCheckAt: number
}

class CampaignManager {
  private dbPath: string
  private campaigns: CampaignState[] = []

  constructor() {
    this.dbPath = path.join(app.getPath('userData'), 'operator-campaigns.json')
    this.load()
  }

  private load() {
    try {
      if (fs.existsSync(this.dbPath)) {
        this.campaigns = JSON.parse(fs.readFileSync(this.dbPath, 'utf8'))
      }
    } catch (err) {
      console.error('[CampaignManager] Failed to load campaigns.json:', err)
      this.campaigns = []
    }
  }

  private save() {
    try {
      fs.writeFileSync(this.dbPath, JSON.stringify(this.campaigns, null, 2))
    } catch (err) {
      console.error('[CampaignManager] Failed to save campaigns.json:', err)
    }
  }

  public enroll(platform: string, type: string, target: string, payload: Record<string, any>, waitHours: number = 24): string {
    const id = `camp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    const state: CampaignState = {
      id,
      platform,
      type,
      target,
      payload,
      status: 'pending_wait',
      createdAt: Date.now(),
      lastChecked: Date.now(),
      nextCheckAt: Date.now() + (waitHours * 60 * 60 * 1000)
    }
    this.campaigns.push(state)
    this.save()
    console.log(`[CampaignManager] Enrolled new campaign: ${id} (${type} -> ${target})`)
    return id
  }

  public updateStatus(id: string, status: CampaignState['status'], resetWaitHours?: number) {
    const c = this.campaigns.find(c => c.id === id)
    if (c) {
      c.status = status
      c.lastChecked = Date.now()
      if (resetWaitHours) {
        c.nextCheckAt = Date.now() + (resetWaitHours * 60 * 60 * 1000)
      }
      this.save()
      console.log(`[CampaignManager] Updated campaign ${id} to ${status}`)
    }
  }

  public getPendingCampaigns(): CampaignState[] {
    const now = Date.now()
    return this.campaigns.filter(c => c.status === 'pending_wait' && now >= c.nextCheckAt)
  }
}

export const campaignManager = new CampaignManager()
