import React, { useState } from 'react'
import { Globe } from 'lucide-react'

const DOMAIN_MAP: Record<string, string> = {
  linkedin: 'linkedin.com',
  twitter: 'x.com',
  instagram: 'instagram.com',
  whatsapp: 'whatsapp.com',
  telegram: 'telegram.org',
  reddit: 'reddit.com',
  youtube: 'youtube.com',
  google: 'google.com',
}

interface Props {
  platform: string
  size?: number
  className?: string
}

export default function PlatformIcon({ platform, size = 16, className = '' }: Props) {
  const [error, setError] = useState(false)
  const normalized = platform.toLowerCase().replace('_popup', '')
  const domain = DOMAIN_MAP[normalized]

  // If no known domain or image failed to load, show a fallback icon
  if (error || (!domain && normalized !== 'unknown')) {
    return (
      <Globe 
        size={size} 
        className={className} 
        style={{ opacity: 0.7 }}
      />
    )
  }

  if (normalized === 'unknown') {
    return (
      <Globe 
        size={size} 
        className={className} 
        style={{ opacity: 0.7 }}
      />
    )
  }

  const src = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`

  return (
    <img
      src={src}
      alt={platform}
      width={size}
      height={size}
      className={className}
      style={{ borderRadius: '4px', objectFit: 'contain' }}
      onError={() => setError(true)}
    />
  )
}
