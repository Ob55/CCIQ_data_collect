// Multiple-photo handling in export shaping (pure — no DB). Verifies arrays of attachments
// are collected for signing and rendered into a single cell.
import { describe, it, expect } from 'vitest'
import { collectImagePaths, buildSheets } from '../src/lib/export-build.js'

describe('multiple photos in export', () => {
  it('collectImagePaths finds photos in arrays, singles, and nested repeats', () => {
    const set = new Set()
    collectImagePaths(
      {
        photos: [{ storage_path: 'a.jpg' }, { storage_path: 'b.jpg' }],
        single: { storage_path: 'c.jpg' },
        visits: [{ pic: { storage_path: 'd.jpg' } }, { pic: [{ storage_path: 'e.jpg' }] }],
      },
      set
    )
    expect([...set].sort()).toEqual(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg'])
  })

  it('buildSheets joins multiple signed photo URLs into one cell', () => {
    const merged = { main: [{ name: 'photo', type: 'image', label: 'Photo' }], repeats: [] }
    const submissions = [
      {
        id: 's1',
        enumerator: 'E',
        role: 'enumerator',
        submitted_at: 't',
        duration: null,
        status: 'new',
        comment: '',
        version_no: 1,
        data: { photo: [{ storage_path: 'a.jpg' }, { storage_path: 'b.jpg' }] },
      },
    ]
    const { main } = buildSheets({
      merged,
      submissions,
      headerMode: 'labels',
      imageUrlMap: { 'a.jpg': 'https://x/a', 'b.jpg': 'https://x/b' },
    })
    const row = main[1]
    expect(row[row.length - 1]).toBe('https://x/a\nhttps://x/b')
  })

  it('still handles a single photo object (backward compatible)', () => {
    const merged = { main: [{ name: 'photo', type: 'image', label: 'Photo' }], repeats: [] }
    const submissions = [
      {
        id: 's1',
        enumerator: 'E',
        role: 'enumerator',
        submitted_at: 't',
        duration: null,
        status: 'new',
        comment: '',
        version_no: 1,
        data: { photo: { storage_path: 'a.jpg' } },
      },
    ]
    const { main } = buildSheets({
      merged,
      submissions,
      headerMode: 'labels',
      imageUrlMap: { 'a.jpg': 'https://x/a' },
    })
    expect(main[1][main[1].length - 1]).toBe('https://x/a')
  })
})
