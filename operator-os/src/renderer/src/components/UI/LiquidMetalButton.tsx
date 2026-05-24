import React from 'react'
import './LiquidMetalButton.css'

interface LiquidMetalButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode
  variant?: 'primary' | 'secondary' | 'danger'
}

export default function LiquidMetalButton({ children, variant = 'primary', className = '', ...props }: LiquidMetalButtonProps) {
  return (
    <button 
      className={`liquid-metal-btn liquid-metal-btn-${variant} ${className}`} 
      {...props}
    >
      <div className="liquid-metal-inner">
        <span className="liquid-metal-text">{children}</span>
      </div>
      {/* Dynamic light reflection layers */}
      <div className="liquid-metal-glare"></div>
      <div className="liquid-metal-glow"></div>
    </button>
  )
}
