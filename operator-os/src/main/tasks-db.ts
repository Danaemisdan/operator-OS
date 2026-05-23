import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

export interface TaskLog {
  id: string
  intent: string
  workflowId?: string
  platform?: string
  startTime: number
  endTime?: number
  durationMs?: number
  status: 'running' | 'done' | 'failed'
  error?: string
  outputs?: any
  extractedDataCount?: number
}

export class TasksDB {
  private dbPath: string

  constructor() {
    this.dbPath = path.join(app.getPath('userData'), 'operator-tasks.json')
    this.ensureDb()
  }

  private ensureDb() {
    if (!fs.existsSync(this.dbPath)) {
      fs.writeFileSync(this.dbPath, JSON.stringify([], null, 2))
    }
  }

  private readDb(): TaskLog[] {
    try {
      return JSON.parse(fs.readFileSync(this.dbPath, 'utf-8'))
    } catch {
      return []
    }
  }

  private writeDb(data: TaskLog[]) {
    fs.writeFileSync(this.dbPath, JSON.stringify(data, null, 2))
  }

  getAllTasks(): TaskLog[] {
    return this.readDb().sort((a, b) => b.startTime - a.startTime)
  }

  logTaskStart(task: TaskLog) {
    const tasks = this.readDb()
    tasks.push(task)
    this.writeDb(tasks)
  }

  logTaskEnd(id: string, updates: Partial<TaskLog>) {
    const tasks = this.readDb()
    const idx = tasks.findIndex(t => t.id === id)
    if (idx !== -1) {
      tasks[idx] = { ...tasks[idx], ...updates, endTime: Date.now() }
      if (tasks[idx].endTime) {
        tasks[idx].durationMs = tasks[idx].endTime - tasks[idx].startTime
      }
      this.writeDb(tasks)
    }
  }
}

export const tasksDB = new TasksDB()
