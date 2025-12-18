import { NextRequest, NextResponse } from 'next/server'
import { readdir, stat } from 'fs/promises'
import { join } from 'path'

interface FolderItem {
  name: string
  type: 'file' | 'folder'
  path: string
}

export async function POST(request: NextRequest) {
  try {
    const { folderPath } = await request.json()
    
    if (!folderPath || typeof folderPath !== 'string') {
      return NextResponse.json({ error: 'Invalid folder path' }, { status: 400 })
    }

    // Security: Only allow paths that start with /Users/ (macOS user directories)
    if (!folderPath.startsWith('/Users/')) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 403 })
    }

    try {
      const items: FolderItem[] = []
      const entries = await readdir(folderPath)

      for (const entry of entries) {
        // Skip hidden files
        if (entry.startsWith('.')) continue

        const fullPath = join(folderPath, entry)
        try {
          const stats = await stat(fullPath)
          items.push({
            name: entry,
            type: stats.isDirectory() ? 'folder' : 'file',
            path: fullPath
          })
        } catch (err) {
          // Skip files we can't access
          continue
        }
      }

      // Sort: folders first, then files, both alphabetically
      items.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'folder' ? -1 : 1
        }
        return a.name.localeCompare(b.name)
      })

      return NextResponse.json({ items })
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return NextResponse.json({ error: 'Folder not found' }, { status: 404 })
      }
      if (err.code === 'EACCES') {
        return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
      }
      throw err
    }
  } catch (error: any) {
    console.error('Error listing folder:', error)
    return NextResponse.json({ 
      error: 'Failed to list folder contents',
      details: error.message || String(error)
    }, { status: 500 })
  }
}

