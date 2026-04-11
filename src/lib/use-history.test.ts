import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useHistory } from './use-history'

beforeEach(() => {
  localStorage.clear()
})

describe('useHistory', () => {
  it('starts with empty entries', () => {
    const { result } = renderHook(() => useHistory('test-history'))
    expect(result.current.entries).toEqual([])
  })

  it('adds an entry', () => {
    const { result } = renderHook(() => useHistory('test-history'))
    act(() => {
      result.current.addEntry('first entry')
    })
    expect(result.current.entries).toHaveLength(1)
    expect(result.current.entries[0].value).toBe('first entry')
    expect(result.current.entries[0].timestamp).toBeGreaterThan(0)
  })

  it('adds entries in reverse chronological order', () => {
    const { result } = renderHook(() => useHistory('test-history'))
    act(() => {
      result.current.addEntry('first')
    })
    act(() => {
      result.current.addEntry('second')
    })
    expect(result.current.entries[0].value).toBe('second')
    expect(result.current.entries[1].value).toBe('first')
  })

  it('deduplicates entries, keeping the latest', () => {
    const { result } = renderHook(() => useHistory('test-history'))
    act(() => {
      result.current.addEntry('dup')
    })
    act(() => {
      result.current.addEntry('other')
    })
    act(() => {
      result.current.addEntry('dup')
    })
    expect(result.current.entries).toHaveLength(2)
    expect(result.current.entries[0].value).toBe('dup')
    expect(result.current.entries[1].value).toBe('other')
  })

  it('ignores empty/whitespace-only entries', () => {
    const { result } = renderHook(() => useHistory('test-history'))
    act(() => {
      result.current.addEntry('')
    })
    act(() => {
      result.current.addEntry('   ')
    })
    expect(result.current.entries).toHaveLength(0)
  })

  it('respects maxItems limit', () => {
    const { result } = renderHook(() => useHistory('test-history', 3))
    act(() => {
      for (let i = 0; i < 5; i++) {
        result.current.addEntry(`entry-${i}`)
      }
    })
    expect(result.current.entries).toHaveLength(3)
    expect(result.current.entries[0].value).toBe('entry-4')
  })

  it('removes an entry by timestamp', () => {
    const now = 1000
    vi.spyOn(Date, 'now').mockReturnValueOnce(now).mockReturnValueOnce(now + 1)
    const { result } = renderHook(() => useHistory('test-history'))
    act(() => {
      result.current.addEntry('to-remove')
    })
    act(() => {
      result.current.addEntry('to-keep')
    })
    // 'to-keep' is at index 0 (newest), 'to-remove' at index 1
    const ts = result.current.entries[1].timestamp
    act(() => {
      result.current.removeEntry(ts)
    })
    expect(result.current.entries).toHaveLength(1)
    expect(result.current.entries[0].value).toBe('to-keep')
  })

  it('clears all entries', () => {
    const { result } = renderHook(() => useHistory('test-history'))
    act(() => {
      result.current.addEntry('a')
      result.current.addEntry('b')
    })
    act(() => {
      result.current.clearHistory()
    })
    expect(result.current.entries).toEqual([])
  })

  it('persists to localStorage', () => {
    const { result } = renderHook(() => useHistory('persist-test'))
    act(() => {
      result.current.addEntry('persisted')
    })
    const stored = JSON.parse(localStorage.getItem('persist-test')!)
    expect(stored).toHaveLength(1)
    expect(stored[0].value).toBe('persisted')
  })
})
