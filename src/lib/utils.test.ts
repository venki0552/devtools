import { describe, it, expect } from 'vitest'
import { cn, formatBytes, formatDuration } from './utils'

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('handles conditional classes', () => {
    expect(cn('base', false && 'hidden', 'visible')).toBe('base visible')
  })

  it('resolves tailwind conflicts', () => {
    const result = cn('px-4', 'px-2')
    expect(result).toBe('px-2')
  })

  it('handles undefined and null', () => {
    expect(cn('foo', undefined, null, 'bar')).toBe('foo bar')
  })

  it('handles empty call', () => {
    expect(cn()).toBe('')
  })
})

describe('formatBytes', () => {
  it('formats 0 bytes', () => {
    expect(formatBytes(0)).toBe('0 B')
  })

  it('formats bytes', () => {
    expect(formatBytes(500)).toBe('500 B')
  })

  it('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1 KB')
  })

  it('formats megabytes', () => {
    expect(formatBytes(1048576)).toBe('1 MB')
  })

  it('formats with decimals', () => {
    expect(formatBytes(1536)).toBe('1.5 KB')
  })
})

describe('formatDuration', () => {
  it('formats sub-millisecond', () => {
    expect(formatDuration(0.5)).toBe('<1ms')
  })

  it('formats milliseconds', () => {
    expect(formatDuration(42)).toBe('42ms')
  })

  it('formats seconds', () => {
    expect(formatDuration(1500)).toBe('1.5s')
  })

  it('rounds milliseconds', () => {
    expect(formatDuration(3.7)).toBe('4ms')
  })
})
