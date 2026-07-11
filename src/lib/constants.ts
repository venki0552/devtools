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
import toolsMeta from './tools-meta.json'

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

export const TOOL_CATEGORIES: ToolCategory[] = [
  'Formatters',
  'Converters',
  'Encoders & Decoders',
  'Generators & Inspectors',
  'Viewers & Comparators',
]

// Tool metadata lives in tools-meta.json so the SEO build scripts
// (sitemap, prerender) can consume the same data without a bundler.
// Icons are React components, so they attach here.
const TOOL_ICONS: Record<string, LucideIcon> = {
  json: Braces,
  xml: FileCode,
  'sql-formatter': Database,
  graphql: Workflow,
  'csv-json': TableProperties,
  'yaml-json': FileJson,
  base64: Binary,
  jwt: KeyRound,
  url: Link,
  hash: Hash,
  regex: Regex,
  cron: Clock,
  'http-status': Globe,
  epoch: Timer,
  uuid: Fingerprint,
  color: Palette,
  env: Settings,
  'json-diff': GitCompare,
  diff: FileDiff,
  'sql-visualizer': Database,
  'mock-api': Server,
}

export const TOOLS: Tool[] = toolsMeta.tools.map((t) => ({
  ...t,
  category: t.category as ToolCategory,
  icon: TOOL_ICONS[t.id],
}))

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
