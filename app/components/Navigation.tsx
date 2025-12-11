'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTitles } from '../hooks/useTitles'
import EditableText from './EditableText'

import { useColors } from '../hooks/useColors'
import ColorPicker from './ColorPicker'

interface NavigationProps {
  onSectionClick: (section: string) => void
  titles: ReturnType<typeof useTitles>['titles']
  colors?: ReturnType<typeof useColors>['colors']
}

export default function Navigation({ onSectionClick, titles, colors: colorsProp }: NavigationProps) {
  const { colors: defaultColors, updateColor } = useColors()
  const colors = colorsProp || defaultColors
  const [isOpen, setIsOpen] = useState(false)
  const { updateTitle } = useTitles()
  const [editMode, setEditMode] = useState(false)

  // Check if edit mode is active (from HeroImage)
  useEffect(() => {
    const checkEditMode = () => {
      const editModeActive = localStorage.getItem('editModeActive') === 'true'
      setEditMode(editModeActive)
    }
    checkEditMode()
    // Listen for storage events (when localStorage changes in another tab/window)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'editModeActive') {
        checkEditMode()
      }
    }
    window.addEventListener('storage', handleStorageChange)
    // Poll for changes (in case storage event doesn't fire for same-tab changes)
    const interval = setInterval(checkEditMode, 200)
    return () => {
      clearInterval(interval)
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [])

  // Helper function to convert to Title Case (first letter uppercase, rest lowercase)
  const toTitleCase = (str: string) => {
    if (!str) return ''
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
  }

  const menuItems = [
    { name: toTitleCase(titles?.navigation?.bio || 'Bio'), id: 'bio' },
    { name: toTitleCase(titles?.navigation?.signup || 'Sign Up'), id: 'signup' },
    { name: toTitleCase(titles?.navigation?.resume || 'Resume'), id: 'resume' },
    { name: toTitleCase(titles?.navigation?.music || 'Music'), id: 'music' },
    { name: toTitleCase(titles?.navigation?.store || 'Store'), id: 'store' },
  ]


  return (
    <>
      {/* Button Menu - Kim Petras style */}
      <button
        type="button"
        className="fixed top-4 left-4 md:top-6 md:left-6 cursor-pointer transition-all duration-300"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setIsOpen(prev => !prev)
        }}
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
        style={{
          width: '40px',
          height: '40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'transparent',
          border: 'none',
          padding: 0,
          pointerEvents: 'auto',
          zIndex: 9999,
          cursor: 'pointer',
          position: 'fixed',
        }}
      >
        {/* Hamburger icon - transforms to X when open */}
        <div className="relative w-6 h-5">
          <span 
            className="absolute w-full h-0.5 transition-all duration-300 bg-black"
            style={{ 
              top: isOpen ? '50%' : '0',
              transform: isOpen ? 'translateY(-50%) rotate(45deg)' : 'none',
            }}
          />
          <span 
            className="absolute w-full h-0.5 transition-all duration-300 bg-black"
            style={{ 
              top: '50%',
              left: '0',
              transform: 'translateY(-50%)',
              opacity: isOpen ? 0 : 1,
            }}
          />
          <span 
            className="absolute w-full h-0.5 transition-all duration-300 bg-black"
            style={{ 
              bottom: isOpen ? '50%' : '0',
              transform: isOpen ? 'translateY(50%) rotate(-45deg)' : 'none',
            }}
          />
        </div>
      </button>

      {/* No backdrop - removed black fade */}

      {/* Sidebar Menu - Kim Petras style */}
      <AnimatePresence>
        {isOpen && (
          <motion.nav
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 left-0 h-full"
            style={{
              width: typeof window !== 'undefined' && window.innerWidth < 768 ? '100vw' : '300px',
              maxWidth: '80vw',
              backgroundColor: 'transparent',
              boxShadow: 'none',
              pointerEvents: 'auto',
              zIndex: 9998,
              position: 'fixed',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {editMode && updateColor && (
              <div className="absolute top-16 md:top-20 right-2 md:right-4 bg-black border border-white/20 p-3 md:p-4 rounded shadow-lg z-[101] flex flex-col gap-2 md:gap-3 min-w-[200px] md:min-w-[250px] max-w-[90vw]">
                <h4 className="text-white text-sm font-bold mb-2">Navigation Colors</h4>
                <ColorPicker
                  label="Text"
                  value={colors?.navigation?.text || '#ffffff'}
                  onChange={(value) => {
                    if (updateColor) {
                      updateColor('navigation', 'text', value)
                    }
                  }}
                />
                <ColorPicker
                  label="Hover"
                  value={colors?.navigation?.hover || '#9ca3af'}
                  onChange={(value) => {
                    if (updateColor) {
                      updateColor('navigation', 'hover', value)
                    }
                  }}
                />
                <ColorPicker
                  label="Background"
                  value={colors?.navigation?.background || '#000000'}
                  onChange={(value) => {
                    if (updateColor) {
                      updateColor('navigation', 'background', value)
                    }
                  }}
                />
              </div>
            )}
            
            {/* Menu items list */}
            <div className="flex flex-col p-4 md:p-6 pt-16 md:pt-20 space-y-4 md:space-y-6" style={{ pointerEvents: 'auto', zIndex: 101 }}>
              {menuItems.map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ delay: index * 0.05, duration: 0.2 }}
                  style={{ pointerEvents: 'auto', zIndex: 101 }}
                >
                  {editMode ? (
                    <EditableText
                      value={item.name}
                      onChange={(newValue) => {
                        const titleCaseValue = toTitleCase(newValue)
                        updateTitle('navigation', item.id, titleCaseValue)
                      }}
                      isEditing={editMode}
                      className="block text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight py-2"
                      style={{ 
                        fontFamily: 'var(--font-script), cursive',
                        color: '#000000',
                        letterSpacing: '0.02em',
                        pointerEvents: 'auto',
                      }}
                    />
                  ) : (
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        onSectionClick(item.id)
                        setIsOpen(false)
                      }}
                      className="block text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight py-2 md:py-3 w-full text-left transition-all duration-200 touch-manipulation min-h-[44px] flex items-center"
                      style={{ 
                        fontFamily: 'var(--font-script), cursive',
                        color: '#000000', // Always black for visibility
                        backgroundColor: 'transparent',
                        letterSpacing: '0.02em',
                        pointerEvents: 'auto',
                        zIndex: 101,
                        cursor: 'pointer',
                        transform: 'scale(1)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#333333' // Dark gray on hover
                        e.currentTarget.style.transform = 'scale(1.05)'
                        e.currentTarget.style.transition = 'all 0.2s ease'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = '#000000' // Back to black
                        e.currentTarget.style.transform = 'scale(1)'
                        e.currentTarget.style.transition = 'all 0.2s ease'
                      }}
                    >
                      {item.name}
                    </button>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </>
  )
}
