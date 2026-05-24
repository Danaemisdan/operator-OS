import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs/promises'

export interface ScheduledTask {
  id: string
  intent: string
  timestampMs: number
  status: 'pending' | 'completed' | 'failed'
}

const getSchedulerPath = () => {
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, 'operator-schedule.json')
}

export async function loadSchedule(): Promise<ScheduledTask[]> {
  const schedulePath = getSchedulerPath()
  try {
    const data = await fs.readFile(schedulePath, 'utf-8')
    return JSON.parse(data) as ScheduledTask[]
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      await fs.writeFile(schedulePath, JSON.stringify([], null, 2), 'utf-8')
      return []
    }
    throw err
  }
}

export async function saveSchedule(schedule: ScheduledTask[]): Promise<void> {
  const schedulePath = getSchedulerPath()
  await fs.writeFile(schedulePath, JSON.stringify(schedule, null, 2), 'utf-8')
}

export async function scheduleTask(intent: string, delayMs: number): Promise<string> {
  const schedule = await loadSchedule()
  const id = `sched_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
  
  const task: ScheduledTask = {
    id,
    intent,
    timestampMs: Date.now() + delayMs,
    status: 'pending'
  }
  
  schedule.push(task)
  await saveSchedule(schedule)
  return id
}

export async function getPendingTasks(): Promise<ScheduledTask[]> {
  const schedule = await loadSchedule()
  return schedule.filter(t => t.status === 'pending')
}

export async function markTaskCompleted(id: string): Promise<void> {
  const schedule = await loadSchedule()
  const task = schedule.find(t => t.id === id)
  if (task) {
    task.status = 'completed'
    await saveSchedule(schedule)
  }
}
