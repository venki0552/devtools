import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLocalStorage } from './use-local-storage'

beforeEach(() => {
  localStorage.clear()
})

describe('useLocalStorage', () => {
  it('returns default value when key is not in storage', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 'default'))
    expect(result.current[0]).toBe('default')
  })

  it('returns stored value when key exists', () => {
    localStorage.setItem('test-key', JSON.stringify('stored-value'))
    const { result } = renderHook(() => useLocalStorage('test-key', 'default'))
    expect(result.current[0]).toBe('stored-value')
  })

  it('writes value to localStorage', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 'default'))
    act(() => {
      result.current[1]('new-value')
    })
    expect(result.current[0]).toBe('new-value')
    expect(JSON.parse(localStorage.getItem('test-key')!)).toBe('new-value')
  })

  it('handles objects', () => {
    const { result } = renderHook(() =>
      useLocalStorage('obj-key', { a: 1 }),
    )
    act(() => {
      result.current[1]({ a: 2, b: 3 } as { a: number; b?: number })
    })
    expect(result.current[0]).toEqual({ a: 2, b: 3 })
  })

  it('handles arrays', () => {
    const { result } = renderHook(() => useLocalStorage<number[]>('arr-key', []))
    act(() => {
      result.current[1]([1, 2, 3])
    })
    expect(result.current[0]).toEqual([1, 2, 3])
  })

  it('returns default on malformed JSON in storage', () => {
    localStorage.setItem('bad-key', 'not-valid-json{')
    const { result } = renderHook(() => useLocalStorage('bad-key', 'fallback'))
    expect(result.current[0]).toBe('fallback')
  })

  it('supports updater function', () => {
    const { result } = renderHook(() => useLocalStorage('count', 0))
    act(() => {
      result.current[1]((prev) => prev + 1)
    })
    expect(result.current[0]).toBe(1)
    act(() => {
      result.current[1]((prev) => prev + 5)
    })
    expect(result.current[0]).toBe(6)
  })

  it('handles boolean values', () => {
    const { result } = renderHook(() => useLocalStorage('bool-key', false))
    act(() => {
      result.current[1](true)
    })
    expect(result.current[0]).toBe(true)
    expect(JSON.parse(localStorage.getItem('bool-key')!)).toBe(true)
  })

  it('handles null values', () => {
    const { result } = renderHook(() => useLocalStorage<string | null>('null-key', null))
    expect(result.current[0]).toBe(null)
    act(() => {
      result.current[1]('something')
    })
    expect(result.current[0]).toBe('something')
  })
})
