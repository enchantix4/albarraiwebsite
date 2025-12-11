'use client'

import DraggableWindow from './DraggableWindow'
import resumeData from '@/data/resume.json'

import { useColors } from '../hooks/useColors'

interface ResumeModalProps {
  isOpen: boolean
  onClose: () => void
  zIndex?: number
  onFocus?: () => void
  title?: string
  colors?: ReturnType<typeof useColors>['colors']
}

export default function ResumeModal({ isOpen, onClose, zIndex, onFocus, title = 'RESUME', colors: colorsProp }: ResumeModalProps) {
  const { colors: defaultColors } = useColors()
  const colors = colorsProp || defaultColors
  
  return (
    <DraggableWindow
      id="resume"
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      initialPosition={{ x: typeof window !== 'undefined' && window.innerWidth < 768 ? 0 : 200, y: typeof window !== 'undefined' && window.innerWidth < 768 ? 0 : 150 }}
      initialSize={{ width: typeof window !== 'undefined' && window.innerWidth < 768 ? window.innerWidth : 700, height: typeof window !== 'undefined' && window.innerWidth < 768 ? window.innerHeight : 600 }}
      zIndex={zIndex}
      onFocus={onFocus}
      colors={colors}
    >
      <div className="space-y-8">
        {resumeData.map((role, index) => (
          <div key={index} className="border-b border-white/10 pb-6 last:border-0">
            <h3 className="text-base md:text-lg font-bold mb-2 uppercase tracking-tight" style={{ color: colors.window.text }}>{role.roleTitle}</h3>
            <p className="text-sm mb-3 leading-relaxed" style={{ color: colors.window.text, opacity: 0.7 }}>{role.shortDescription}</p>
            <div className="flex flex-wrap gap-2">
              {role.skills.map((skill, skillIndex) => (
                <span
                  key={skillIndex}
                  className="px-2 py-1 text-xs uppercase tracking-wider"
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    color: '#ffffff',
                  }}
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </DraggableWindow>
  )
}

