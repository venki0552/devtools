import type { LucideIcon } from 'lucide-react'
import {
  Braces,
  FileCode,
  Database,
  TableProperties,
  FileJson,
  GitCompare,
  Binary,
  KeyRound,
  Link,
  Hash,
  Regex,
  Clock,
  Globe,
  Server,
  Timer,
  Fingerprint,
  Palette,
  FileDiff,
  Workflow,
  Settings,
} from 'lucide-react'

export interface Tool {
  id: string
  name: string
  description: string
  route: string
  icon: LucideIcon
  category: ToolCategory
  keywords: string[]
}

export type ToolCategory =
  | 'Formatters'
  | 'Converters'
  | 'Encoders & Decoders'
  | 'Generators & Inspectors'
  | 'Viewers & Comparators'
  | 'AI-Powered'

export const TOOL_CATEGORIES: ToolCategory[] = [
  'Formatters',
  'Converters',
  'Encoders & Decoders',
  'Generators & Inspectors',
  'Viewers & Comparators',
  'AI-Powered',
]

export const TOOLS: Tool[] = [
  // Formatters
  {
    id: 'json',
    name: 'JSON Parser & Formatter',
    description: 'Parse, format, minify, and explore JSON with intelligent auto-fix for malformed input.',
    route: '/json',
    icon: Braces,
    category: 'Formatters',
    keywords: ['json', 'format', 'parse', 'minify', 'prettify', 'validate', 'tree'],
  },
  {
    id: 'xml',
    name: 'XML Formatter',
    description: 'Format, validate, and explore XML documents with structure analysis.',
    route: '/xml',
    icon: FileCode,
    category: 'Formatters',
    keywords: ['xml', 'format', 'validate', 'html', 'structure'],
  },
  {
    id: 'sql-formatter',
    name: 'SQL Formatter',
    description: 'Format and beautify SQL queries with dialect-aware indentation.',
    route: '/sql-formatter',
    icon: Database,
    category: 'Formatters',
    keywords: ['sql', 'format', 'query', 'beautify', 'indent', 'postgresql', 'mysql'],
  },
  {
    id: 'graphql',
    name: 'GraphQL Formatter',
    description: 'Format GraphQL queries and explore SDL schemas with type inspection.',
    route: '/graphql',
    icon: Workflow,
    category: 'Formatters',
    keywords: ['graphql', 'format', 'schema', 'query', 'mutation', 'sdl'],
  },
  // Converters
  {
    id: 'csv-json',
    name: 'CSV ↔ JSON',
    description: 'Convert between CSV and JSON with smart delimiter detection and type inference.',
    route: '/csv-json',
    icon: TableProperties,
    category: 'Converters',
    keywords: ['csv', 'json', 'convert', 'table', 'spreadsheet', 'delimiter'],
  },
  {
    id: 'yaml-json',
    name: 'YAML ↔ JSON',
    description: 'Convert between YAML and JSON with round-trip validation and anchor resolution.',
    route: '/yaml-json',
    icon: FileJson,
    category: 'Converters',
    keywords: ['yaml', 'json', 'convert', 'kubernetes', 'config', 'helm'],
  },
  // Encoders & Decoders
  {
    id: 'base64',
    name: 'Base64 Encode / Decode',
    description: 'Encode and decode Base64 for text and files with auto-detection.',
    route: '/base64',
    icon: Binary,
    category: 'Encoders & Decoders',
    keywords: ['base64', 'encode', 'decode', 'binary', 'data-uri', 'file'],
  },
  {
    id: 'jwt',
    name: 'JWT Decoder',
    description: 'Decode and inspect JSON Web Tokens with claim analysis and expiry checking.',
    route: '/jwt',
    icon: KeyRound,
    category: 'Encoders & Decoders',
    keywords: ['jwt', 'token', 'decode', 'claims', 'auth', 'bearer'],
  },
  {
    id: 'url',
    name: 'URL Encode / Decode',
    description: 'Encode, decode, and parse URLs with query string inspection and builder.',
    route: '/url',
    icon: Link,
    category: 'Encoders & Decoders',
    keywords: ['url', 'encode', 'decode', 'query', 'parameter', 'uri'],
  },
  {
    id: 'hash',
    name: 'Hash Generator',
    description: 'Generate MD5, SHA-1, SHA-256, SHA-384, SHA-512 hashes for text and files.',
    route: '/hash',
    icon: Hash,
    category: 'Encoders & Decoders',
    keywords: ['hash', 'md5', 'sha', 'sha256', 'checksum', 'digest'],
  },
  // Generators & Inspectors
  {
    id: 'regex',
    name: 'Regex Tester',
    description: 'Test regular expressions with live highlighting, group capture, and pattern library.',
    route: '/regex',
    icon: Regex,
    category: 'Generators & Inspectors',
    keywords: ['regex', 'regular expression', 'pattern', 'match', 'replace', 'test'],
  },
  {
    id: 'cron',
    name: 'CRON Builder',
    description: 'Build and decode cron expressions with visual editor and next-run preview.',
    route: '/cron',
    icon: Clock,
    category: 'Generators & Inspectors',
    keywords: ['cron', 'schedule', 'crontab', 'timer', 'job', 'recurring'],
  },
  {
    id: 'http-status',
    name: 'HTTP Status Codes',
    description: 'Quick reference for all HTTP status codes with descriptions and common causes.',
    route: '/http-status',
    icon: Globe,
    category: 'Generators & Inspectors',
    keywords: ['http', 'status', 'code', '404', '500', '200', 'response', 'api'],
  },
  {
    id: 'epoch',
    name: 'Epoch Converter',
    description: 'Convert between Unix timestamps and human-readable dates across timezones.',
    route: '/epoch',
    icon: Timer,
    category: 'Generators & Inspectors',
    keywords: ['epoch', 'timestamp', 'unix', 'date', 'time', 'timezone', 'utc'],
  },
  {
    id: 'uuid',
    name: 'UUID Generator',
    description: 'Generate UUIDv4, UUIDv7, and ULID with bulk generation and format options.',
    route: '/uuid',
    icon: Fingerprint,
    category: 'Generators & Inspectors',
    keywords: ['uuid', 'guid', 'ulid', 'generate', 'unique', 'identifier'],
  },
  {
    id: 'color',
    name: 'Color Converter',
    description: 'Convert between color formats (HEX, RGB, HSL, Lab, Oklch) with palette generator.',
    route: '/color',
    icon: Palette,
    category: 'Generators & Inspectors',
    keywords: ['color', 'hex', 'rgb', 'hsl', 'palette', 'contrast', 'wcag'],
  },
  {
    id: 'env',
    name: 'Env Var Manager',
    description: 'Manage environment variables across projects with import, export, and comparison.',
    route: '/env',
    icon: Settings,
    category: 'Generators & Inspectors',
    keywords: ['env', 'environment', 'variable', 'dotenv', 'config', 'secret'],
  },
  // Viewers & Comparators
  {
    id: 'json-diff',
    name: 'JSON Diff',
    description: 'Deep diff two JSON objects with tree visualization and JSON Patch output.',
    route: '/json-diff',
    icon: GitCompare,
    category: 'Viewers & Comparators',
    keywords: ['json', 'diff', 'compare', 'difference', 'patch', 'merge'],
  },
  {
    id: 'diff',
    name: 'Text Diff',
    description: 'Compare two text files with unified or side-by-side diff view.',
    route: '/diff',
    icon: FileDiff,
    category: 'Viewers & Comparators',
    keywords: ['diff', 'compare', 'text', 'merge', 'patch', 'unified'],
  },
  // AI-Powered
  {
    id: 'sql-visualizer',
    name: 'SQL Visualizer',
    description: 'AI-powered SQL analysis with join graphs, data flow diagrams, and plain-English explanations.',
    route: '/sql-visualizer',
    icon: Database,
    category: 'AI-Powered',
    keywords: ['sql', 'visualize', 'ai', 'join', 'explain', 'diagram', 'analyze'],
  },
  {
    id: 'mock-api',
    name: 'Mock API Generator',
    description: 'Generate realistic mock API responses from schemas or descriptions using AI.',
    route: '/mock-api',
    icon: Server,
    category: 'AI-Powered',
    keywords: ['mock', 'api', 'fake', 'data', 'generate', 'schema', 'faker'],
  },
]

export function getToolsByCategory(): Record<ToolCategory, Tool[]> {
  const grouped = {} as Record<ToolCategory, Tool[]>
  for (const cat of TOOL_CATEGORIES) {
    grouped[cat] = TOOLS.filter((t) => t.category === cat)
  }
  return grouped
}

export function searchTools(query: string): Tool[] {
  const q = query.toLowerCase().trim()
  if (!q) return TOOLS
  return TOOLS.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.keywords.some((k) => k.includes(q)),
  )
}
