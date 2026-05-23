import os from 'os'
import { execSync } from 'child_process'

export type ModelTier = 'TIER_0_MINIMAL' | 'TIER_1_BASE' | 'TIER_2_MID' | 'TIER_3_HIGH' | 'TIER_4_ULTRA'

export interface HardwareProfile {
  tier: ModelTier
  tierName: string
  totalRAM: number
  gpuType: 'apple_silicon' | 'nvidia' | 'amd' | 'integrated' | 'none'
  gpuVRAM: number
  cpuCores: number
  platform: 'darwin' | 'win32' | 'linux'
  arch: string
}

export interface ModelConfig {
  small: string
  medium: string
  large: string
  vision: string
  embed: string
}

const MODEL_CONFIGS: Record<ModelTier, ModelConfig> = {
  TIER_4_ULTRA: {
    small: 'qwen2.5:3b',
    medium: 'qwen2.5:32b',
    large: 'qwen2.5:72b',
    vision: 'qwen2.5vl:7b',
    embed: 'nomic-embed-text'
  },
  TIER_3_HIGH: {
    small: 'qwen2.5:3b',
    medium: 'qwen2.5:14b',
    large: 'qwen2.5:32b',
    vision: 'llava:7b',
    embed: 'nomic-embed-text'
  },
  TIER_2_MID: {
    small: 'phi3.5:mini',
    medium: 'qwen2.5:7b',
    large: 'qwen2.5:14b',
    vision: 'llava:7b',
    embed: 'nomic-embed-text'
  },
  TIER_1_BASE: {
    small: 'phi3.5:mini',
    medium: 'qwen2.5:7b',
    large: 'qwen2.5:7b',
    vision: 'moondream2',
    embed: 'nomic-embed-text'
  },
  TIER_0_MINIMAL: {
    small: 'phi3.5:mini',
    medium: 'phi3.5:mini',
    large: 'llama3.2:3b',
    vision: 'moondream2',
    embed: 'all-minilm'
  }
}

export class HardwareDetector {
  detect(): HardwareProfile {
    const totalRAM = Math.floor(os.totalmem() / (1024 ** 3)) // GB
    const cpuCores = os.cpus().length
    const platform = process.platform as 'darwin' | 'win32' | 'linux'
    const arch = os.arch()

    let gpuType: HardwareProfile['gpuType'] = 'none'
    let gpuVRAM = 0

    try {
      if (platform === 'darwin') {
        // Check for Apple Silicon
        if (arch === 'arm64') {
          gpuType = 'apple_silicon'
          // On Apple Silicon, GPU shares system RAM
          gpuVRAM = totalRAM
        } else {
          // Intel Mac — check for discrete GPU
          const gpuInfo = execSync('system_profiler SPDisplaysDataType 2>/dev/null', {
            encoding: 'utf8',
            timeout: 3000
          })
          if (gpuInfo.includes('NVIDIA')) {
            gpuType = 'nvidia'
            const vramMatch = gpuInfo.match(/VRAM.*?(\d+)\s*MB/i)
            gpuVRAM = vramMatch ? Math.floor(parseInt(vramMatch[1]) / 1024) : 0
          } else if (gpuInfo.includes('AMD') || gpuInfo.includes('Radeon')) {
            gpuType = 'amd'
          } else {
            gpuType = 'integrated'
          }
        }
      } else if (platform === 'win32') {
        const gpuInfo = execSync('wmic path win32_VideoController get name,AdapterRAM /format:csv 2>nul', {
          encoding: 'utf8',
          timeout: 3000
        })
        if (gpuInfo.toLowerCase().includes('nvidia')) {
          gpuType = 'nvidia'
          const vramMatch = gpuInfo.match(/(\d{8,})/g)
          if (vramMatch) gpuVRAM = Math.floor(parseInt(vramMatch[0]) / (1024 ** 3))
        } else if (gpuInfo.toLowerCase().includes('amd') || gpuInfo.toLowerCase().includes('radeon')) {
          gpuType = 'amd'
        }
      }
    } catch {
      // GPU detection failed — use CPU-only tier
    }

    const tier = this.calculateTier(totalRAM, gpuType, gpuVRAM, arch)

    return {
      tier,
      tierName: this.getTierName(tier),
      totalRAM,
      gpuType,
      gpuVRAM,
      cpuCores,
      platform,
      arch
    }
  }

  private calculateTier(
    ram: number,
    gpuType: HardwareProfile['gpuType'],
    vram: number,
    arch: string
  ): ModelTier {
    if (gpuType === 'apple_silicon' && ram >= 32) return 'TIER_4_ULTRA'
    if (gpuType === 'apple_silicon' && ram >= 16) return 'TIER_3_HIGH'
    if (gpuType === 'apple_silicon') return 'TIER_2_MID'
    if (vram >= 16) return 'TIER_3_HIGH'
    if (vram >= 8 || ram >= 32) return 'TIER_2_MID'
    if (ram >= 16) return 'TIER_1_BASE'
    return 'TIER_0_MINIMAL'
  }

  private getTierName(tier: ModelTier): string {
    const names: Record<ModelTier, string> = {
      TIER_4_ULTRA: 'Ultra (Highest Quality)',
      TIER_3_HIGH: 'High Performance',
      TIER_2_MID: 'Balanced',
      TIER_1_BASE: 'Standard',
      TIER_0_MINIMAL: 'Minimal (CPU Only)'
    }
    return names[tier]
  }

  getModelConfig(tier: ModelTier): ModelConfig {
    return MODEL_CONFIGS[tier]
  }
}
