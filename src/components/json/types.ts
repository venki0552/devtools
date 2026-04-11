export type ParseStrategy =
  | 'valid'
  | 'single-quotes'
  | 'trailing-commas'
  | 'unquoted-keys'
  | 'js-object'
  | 'url-encoded'
  | 'base64'
  | 'wrapped'
  | 'comments'
  | 'escaped'
  | 'invalid'

export interface ParseResult {
  success: boolean
  data?: unknown
  strategy?: ParseStrategy
  error?: { message: string; line?: number; col?: number }
}

export interface JsonPrefs {
  indent: 2 | 4 | 'tab'
  sortKeys: boolean
}

export const STRATEGY_LABELS: Record<ParseStrategy, string> = {
  valid: 'Valid JSON',
  'single-quotes': 'Fixed: single quotes → double quotes',
  'trailing-commas': 'Fixed: trailing commas removed',
  'unquoted-keys': 'Fixed: unquoted keys quoted',
  'js-object': 'Fixed: JS object literal parsed',
  'url-encoded': 'Fixed: URL-decoded',
  base64: 'Fixed: Base64-decoded',
  wrapped: 'Fixed: stripped wrapper quotes/backticks',
  comments: 'Fixed: comments stripped',
  escaped: 'Fixed: unescaped string',
  invalid: 'Invalid JSON',
}
