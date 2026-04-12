import { describe, it, expect } from 'vitest'
import { TOOLS, TOOL_CATEGORIES, getToolsByCategory, searchTools } from './constants'

describe('TOOLS', () => {
  it('contains 21 tools', () => {
    expect(TOOLS).toHaveLength(21)
  })

  it('all tools have required fields', () => {
    for (const tool of TOOLS) {
      expect(tool.id).toBeTruthy()
      expect(tool.name).toBeTruthy()
      expect(tool.description).toBeTruthy()
      expect(tool.route).toMatch(/^\//)
      expect(tool.icon).toBeDefined()
      expect(TOOL_CATEGORIES).toContain(tool.category)
      expect(tool.keywords.length).toBeGreaterThan(0)
    }
  })

  it('all tool ids are unique', () => {
    const ids = TOOLS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all tool routes are unique', () => {
    const routes = TOOLS.map((t) => t.route)
    expect(new Set(routes).size).toBe(routes.length)
  })
})

describe('TOOL_CATEGORIES', () => {
  it('contains all expected categories', () => {
    expect(TOOL_CATEGORIES).toEqual([
      'Formatters',
      'Converters',
      'Encoders & Decoders',
      'Generators & Inspectors',
      'Viewers & Comparators',
    ])
  })
})

describe('getToolsByCategory', () => {
  it('returns tools grouped by category', () => {
    const grouped = getToolsByCategory()
    for (const cat of TOOL_CATEGORIES) {
      expect(grouped[cat]).toBeDefined()
      expect(Array.isArray(grouped[cat])).toBe(true)
    }
  })

  it('all tools appear in exactly one category', () => {
    const grouped = getToolsByCategory()
    const allGrouped = Object.values(grouped).flat()
    expect(allGrouped).toHaveLength(TOOLS.length)
  })

  it('each tool is in the correct category', () => {
    const grouped = getToolsByCategory()
    for (const [cat, tools] of Object.entries(grouped)) {
      for (const tool of tools) {
        expect(tool.category).toBe(cat)
      }
    }
  })
})

describe('searchTools', () => {
  it('returns all tools for empty query', () => {
    expect(searchTools('')).toHaveLength(21)
  })

  it('returns all tools for whitespace query', () => {
    expect(searchTools('   ')).toHaveLength(21)
  })

  it('searches by name', () => {
    const results = searchTools('JSON Parser')
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.some((t) => t.id === 'json')).toBe(true)
  })

  it('searches by description', () => {
    const results = searchTools('regular expression')
    expect(results.some((t) => t.id === 'regex')).toBe(true)
  })

  it('searches by keyword', () => {
    const results = searchTools('sha256')
    expect(results.some((t) => t.id === 'hash')).toBe(true)
  })

  it('is case insensitive', () => {
    const results = searchTools('JWT')
    expect(results.some((t) => t.id === 'jwt')).toBe(true)
  })

  it('returns empty array for no matches', () => {
    const results = searchTools('xyznonexistent')
    expect(results).toHaveLength(0)
  })

  it('finds multiple matching tools', () => {
    const results = searchTools('json')
    // Should match json, csv-json, yaml-json, json-diff at minimum
    expect(results.length).toBeGreaterThanOrEqual(4)
  })
})
