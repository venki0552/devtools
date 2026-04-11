import { describe, it, expect, vi, beforeEach } from 'vitest'
import { copyToClipboard } from './clipboard'

describe('copyToClipboard', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('copies text using clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    Object.defineProperty(window, 'isSecureContext', { value: true, writable: true })

    const result = await copyToClipboard('hello')
    expect(result).toBe(true)
    expect(writeText).toHaveBeenCalledWith('hello')
  })

  it('returns false when clipboard API throws', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.assign(navigator, { clipboard: { writeText } })
    Object.defineProperty(window, 'isSecureContext', { value: true, writable: true })

    const result = await copyToClipboard('hello')
    expect(result).toBe(false)
  })

  it('uses fallback when clipboard API unavailable', async () => {
    Object.assign(navigator, { clipboard: undefined })

    const execCommand = vi.fn().mockReturnValue(true)
    document.execCommand = execCommand

    const result = await copyToClipboard('fallback text')
    expect(result).toBe(true)
    expect(execCommand).toHaveBeenCalledWith('copy')
  })

  it('returns false when fallback fails', async () => {
    Object.assign(navigator, { clipboard: undefined })
    document.execCommand = vi.fn().mockReturnValue(false)

    const result = await copyToClipboard('nope')
    expect(result).toBe(false)
  })
})
