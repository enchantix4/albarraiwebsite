import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'

export async function POST(request: NextRequest) {
  const { folderPath } = await request.json()
  
  if (!folderPath?.startsWith('/Users/')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 403 })
  }

  // Execute open command asynchronously and return immediately
  exec(`open "${folderPath}"`, (error) => {
    if (error) console.error('Error opening folder:', error)
  })

  // Return immediately without waiting
  return NextResponse.json({ success: true })
}

