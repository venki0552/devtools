import type { ParseResult } from './types'

function getErrorPosition(e: unknown): { message: string; line?: number; col?: number } {
  const msg = e instanceof Error ? e.message : String(e)
  const posMatch = msg.match(/position\s+(\d+)/i)
  const lineColMatch = msg.match(/line\s+(\d+)\s+column\s+(\d+)/i)
  if (lineColMatch) {
    return { message: msg, line: parseInt(lineColMatch[1]), col: parseInt(lineColMatch[2]) }
  }
  if (posMatch) {
    return { message: msg }
  }
  return { message: msg }
}

function tryValidJson(input: string): ParseResult {
  try {
    const data = JSON.parse(input)
    return { success: true, data, strategy: 'valid' }
  } catch {
    return { success: false }
  }
}

function trySingleQuotes(input: string): ParseResult {
  if (!input.includes("'")) return { success: false }
  try {
    // Replace single quotes with double quotes, but not within already double-quoted strings
    let result = ''
    let inDouble = false
    let inSingle = false
    for (let i = 0; i < input.length; i++) {
      const ch = input[i]
      const prev = i > 0 ? input[i - 1] : ''
      if (ch === '"' && prev !== '\\' && !inSingle) {
        inDouble = !inDouble
        result += ch
      } else if (ch === "'" && prev !== '\\' && !inDouble) {
        if (!inSingle) {
          inSingle = true
          result += '"'
        } else {
          inSingle = false
          result += '"'
        }
      } else {
        result += ch
      }
    }
    const data = JSON.parse(result)
    return { success: true, data, strategy: 'single-quotes' }
  } catch {
    return { success: false }
  }
}

function tryTrailingCommas(input: string): ParseResult {
  if (!input.includes(',')) return { success: false }
  try {
    const cleaned = input.replace(/,\s*([}\]])/g, '$1')
    const data = JSON.parse(cleaned)
    if (cleaned !== input) {
      return { success: true, data, strategy: 'trailing-commas' }
    }
    return { success: false }
  } catch {
    return { success: false }
  }
}

function tryUnquotedKeys(input: string): ParseResult {
  try {
    // Match unquoted keys (word chars before colon not in a string)
    const fixed = input.replace(/(?<=[{,]\s*)([a-zA-Z_$][\w$]*)\s*:/g, '"$1":')
    if (fixed === input) return { success: false }
    const data = JSON.parse(fixed)
    return { success: true, data, strategy: 'unquoted-keys' }
  } catch {
    return { success: false }
  }
}

function tryJsObject(input: string): ParseResult {
  try {
    // Combine single quotes fix + unquoted keys + trailing commas
    let fixed = input
    // Replace single quotes
    fixed = fixed.replace(/'/g, '"')
    // Quote unquoted keys
    fixed = fixed.replace(/(?<=[{,]\s*)([a-zA-Z_$][\w$]*)\s*:/g, '"$1":')
    // Remove trailing commas
    fixed = fixed.replace(/,\s*([}\]])/g, '$1')
    if (fixed === input) return { success: false }
    const data = JSON.parse(fixed)
    return { success: true, data, strategy: 'js-object' }
  } catch {
    return { success: false }
  }
}

function tryUrlEncoded(input: string): ParseResult {
  if (!input.includes('%7B') && !input.includes('%5B') && !input.includes('%22')) {
    return { success: false }
  }
  try {
    const decoded = decodeURIComponent(input)
    const data = JSON.parse(decoded)
    return { success: true, data, strategy: 'url-encoded' }
  } catch {
    return { success: false }
  }
}

function tryBase64(input: string): ParseResult {
  const trimmed = input.trim()
  if (!/^[A-Za-z0-9+/]+=*$/.test(trimmed) || trimmed.length < 4) {
    return { success: false }
  }
  try {
    const decoded = atob(trimmed)
    const data = JSON.parse(decoded)
    return { success: true, data, strategy: 'base64' }
  } catch {
    return { success: false }
  }
}

function tryWrapped(input: string): ParseResult {
  const trimmed = input.trim()
  // Check for backtick wrapping or quote wrapping
  if (
    (trimmed.startsWith('`') && trimmed.endsWith('`')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length > 2) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"') && !trimmed.startsWith('{"'))
  ) {
    try {
      const unwrapped = trimmed.slice(1, -1)
      const data = JSON.parse(unwrapped)
      return { success: true, data, strategy: 'wrapped' }
    } catch {
      // fall through
    }
  }
  return { success: false }
}

function tryComments(input: string): ParseResult {
  if (!input.includes('//') && !input.includes('/*')) return { success: false }
  try {
    // Strip single-line and block comments
    const stripped = input
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
    const data = JSON.parse(stripped)
    return { success: true, data, strategy: 'comments' }
  } catch {
    return { success: false }
  }
}

function tryEscaped(input: string): ParseResult {
  const trimmed = input.trim()
  if (!trimmed.includes('\\"') && !trimmed.includes("\\'")) return { success: false }
  try {
    // Try to unescape: remove outer quotes if present, then unescape inner quotes
    let unescaped = trimmed
    if (
      (unescaped.startsWith('"') && unescaped.endsWith('"')) ||
      (unescaped.startsWith("'") && unescaped.endsWith("'"))
    ) {
      unescaped = unescaped.slice(1, -1)
    }
    unescaped = unescaped.replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\\\/g, '\\')
    const data = JSON.parse(unescaped)
    return { success: true, data, strategy: 'escaped' }
  } catch {
    return { success: false }
  }
}

const strategies = [
  tryValidJson,
  trySingleQuotes,
  tryTrailingCommas,
  tryUnquotedKeys,
  tryJsObject,
  tryUrlEncoded,
  tryBase64,
  tryWrapped,
  tryComments,
  tryEscaped,
]

export function smartParse(input: string): ParseResult {
  const trimmed = input.trim()
  if (!trimmed) {
    return { success: false, error: { message: 'Empty input' } }
  }

  for (const strategy of strategies) {
    const result = strategy(trimmed)
    if (result.success) return result
  }

  // All strategies failed — return the native JSON.parse error
  try {
    JSON.parse(trimmed)
    return { success: false }
  } catch (e) {
    return { success: false, strategy: 'invalid', error: getErrorPosition(e) }
  }
}

export function sortKeysDeep(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortKeysDeep)
  if (obj !== null && typeof obj === 'object') {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((obj as Record<string, unknown>)[key])
    }
    return sorted
  }
  return obj
}

export function formatJson(data: unknown, indent: 2 | 4 | 'tab', sort: boolean): string {
  const toFormat = sort ? sortKeysDeep(data) : data
  const indentStr = indent === 'tab' ? '\t' : indent
  return JSON.stringify(toFormat, null, indentStr)
}

export function minifyJson(data: unknown): string {
  return JSON.stringify(data)
}
