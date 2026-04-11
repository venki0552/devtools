import { describe, it, expect } from 'vitest'
import { smartParse, sortKeysDeep, formatJson, minifyJson } from './parser'

describe('smartParse', () => {
  describe('valid JSON', () => {
    it('parses valid object', () => {
      const r = smartParse('{"a":1}')
      expect(r.success).toBe(true)
      expect(r.data).toEqual({ a: 1 })
      expect(r.strategy).toBe('valid')
    })

    it('parses valid array', () => {
      const r = smartParse('[1,2,3]')
      expect(r.success).toBe(true)
      expect(r.data).toEqual([1, 2, 3])
      expect(r.strategy).toBe('valid')
    })

    it('parses primitives', () => {
      expect(smartParse('"hello"').data).toBe('hello')
      expect(smartParse('42').data).toBe(42)
      expect(smartParse('true').data).toBe(true)
      expect(smartParse('null').data).toBe(null)
    })

    it('parses nested objects', () => {
      const r = smartParse('{"a":{"b":{"c":1}}}')
      expect(r.data).toEqual({ a: { b: { c: 1 } } })
    })

    it('handles whitespace around valid JSON', () => {
      const r = smartParse('  {"a":1}  ')
      expect(r.success).toBe(true)
      expect(r.strategy).toBe('valid')
    })
  })

  describe('empty input', () => {
    it('returns error for empty string', () => {
      const r = smartParse('')
      expect(r.success).toBe(false)
      expect(r.error?.message).toBe('Empty input')
    })

    it('returns error for whitespace-only', () => {
      const r = smartParse('   ')
      expect(r.success).toBe(false)
      expect(r.error?.message).toBe('Empty input')
    })
  })

  describe('single-quotes strategy', () => {
    it('fixes single-quoted keys and values', () => {
      const r = smartParse("{'name':'test'}")
      expect(r.success).toBe(true)
      expect(r.data).toEqual({ name: 'test' })
      expect(r.strategy).toBe('single-quotes')
    })

    it('handles mixed quote styles', () => {
      const r = smartParse("{'name':\"test\"}")
      expect(r.success).toBe(true)
      expect(r.data).toEqual({ name: 'test' })
    })
  })

  describe('trailing-commas strategy', () => {
    it('removes trailing comma in object', () => {
      const r = smartParse('{"a":1,"b":2,}')
      expect(r.success).toBe(true)
      expect(r.data).toEqual({ a: 1, b: 2 })
      expect(r.strategy).toBe('trailing-commas')
    })

    it('removes trailing comma in array', () => {
      const r = smartParse('[1,2,3,]')
      expect(r.success).toBe(true)
      expect(r.data).toEqual([1, 2, 3])
      expect(r.strategy).toBe('trailing-commas')
    })

    it('removes multiple trailing commas', () => {
      const r = smartParse('{"a":{"b":1,},"c":[1,],}')
      expect(r.success).toBe(true)
      expect(r.data).toEqual({ a: { b: 1 }, c: [1] })
    })
  })

  describe('unquoted-keys strategy', () => {
    it('quotes unquoted keys', () => {
      const r = smartParse('{name: "test"}')
      expect(r.success).toBe(true)
      expect(r.data).toEqual({ name: 'test' })
      expect(r.strategy).toBe('unquoted-keys')
    })

    it('handles underscore and $ in keys', () => {
      const r = smartParse('{_id: 1, $ref: "x"}')
      expect(r.success).toBe(true)
      expect(r.data).toEqual({ _id: 1, $ref: 'x' })
    })
  })

  describe('js-object strategy', () => {
    it('handles combined JS object literal issues', () => {
      const r = smartParse("{name: 'test', age: 30,}")
      expect(r.success).toBe(true)
      expect(r.data).toEqual({ name: 'test', age: 30 })
      expect(r.strategy).toBe('js-object')
    })
  })

  describe('url-encoded strategy', () => {
    it('decodes URL-encoded JSON', () => {
      const encoded = encodeURIComponent('{"a":1}')
      const r = smartParse(encoded)
      expect(r.success).toBe(true)
      expect(r.data).toEqual({ a: 1 })
      expect(r.strategy).toBe('url-encoded')
    })
  })

  describe('base64 strategy', () => {
    it('decodes base64-encoded JSON', () => {
      const encoded = btoa('{"a":1}')
      const r = smartParse(encoded)
      expect(r.success).toBe(true)
      expect(r.data).toEqual({ a: 1 })
      expect(r.strategy).toBe('base64')
    })

    it('rejects short base64', () => {
      const r = smartParse('abc')
      expect(r.strategy).not.toBe('base64')
    })
  })

  describe('wrapped strategy', () => {
    it('unwraps backtick-wrapped JSON', () => {
      const r = smartParse('`{"a":1}`')
      expect(r.success).toBe(true)
      expect(r.data).toEqual({ a: 1 })
      expect(r.strategy).toBe('wrapped')
    })

    it('unwraps single-quote-wrapped JSON', () => {
      const r = smartParse("'{\"a\":1}'")
      expect(r.success).toBe(true)
      expect(r.data).toEqual({ a: 1 })
      expect(r.strategy).toBe('wrapped')
    })
  })

  describe('comments strategy', () => {
    it('strips single-line comments', () => {
      const r = smartParse('{"a":1} // comment')
      expect(r.success).toBe(true)
      expect(r.data).toEqual({ a: 1 })
      expect(r.strategy).toBe('comments')
    })

    it('strips block comments', () => {
      const r = smartParse('{"a": /* value */ 1}')
      expect(r.success).toBe(true)
      expect(r.data).toEqual({ a: 1 })
      expect(r.strategy).toBe('comments')
    })
  })

  describe('escaped strategy', () => {
    it('unescapes escaped JSON string', () => {
      // Input is an escaped JSON string (without outer quotes): {\"a\":1}
      const r = smartParse('{\\"a\\":1}')
      expect(r.success).toBe(true)
      expect(r.data).toEqual({ a: 1 })
      expect(r.strategy).toBe('escaped')
    })
  })

  describe('invalid JSON', () => {
    it('returns error with position info', () => {
      const r = smartParse('{invalid}')
      expect(r.success).toBe(false)
      expect(r.strategy).toBe('invalid')
      expect(r.error?.message).toBeTruthy()
    })

    it('returns error for random text', () => {
      const r = smartParse('hello world this is not json')
      expect(r.success).toBe(false)
    })
  })
})

describe('sortKeysDeep', () => {
  it('sorts object keys alphabetically', () => {
    expect(sortKeysDeep({ c: 1, a: 2, b: 3 })).toEqual({ a: 2, b: 3, c: 1 })
  })

  it('sorts nested object keys', () => {
    expect(sortKeysDeep({ z: { b: 1, a: 2 }, a: 1 })).toEqual({ a: 1, z: { a: 2, b: 1 } })
  })

  it('sorts keys in arrays of objects', () => {
    expect(sortKeysDeep([{ b: 1, a: 2 }])).toEqual([{ a: 2, b: 1 }])
  })

  it('returns primitives unchanged', () => {
    expect(sortKeysDeep(42)).toBe(42)
    expect(sortKeysDeep('hello')).toBe('hello')
    expect(sortKeysDeep(null)).toBe(null)
    expect(sortKeysDeep(true)).toBe(true)
  })

  it('preserves array order', () => {
    expect(sortKeysDeep([3, 1, 2])).toEqual([3, 1, 2])
  })
})

describe('formatJson', () => {
  it('formats with 2-space indent', () => {
    const result = formatJson({ a: 1 }, 2, false)
    expect(result).toBe('{\n  "a": 1\n}')
  })

  it('formats with 4-space indent', () => {
    const result = formatJson({ a: 1 }, 4, false)
    expect(result).toBe('{\n    "a": 1\n}')
  })

  it('formats with tab indent', () => {
    const result = formatJson({ a: 1 }, 'tab', false)
    expect(result).toBe('{\n\t"a": 1\n}')
  })

  it('sorts keys when requested', () => {
    const result = formatJson({ c: 1, a: 2, b: 3 }, 2, true)
    expect(result).toBe('{\n  "a": 2,\n  "b": 3,\n  "c": 1\n}')
  })

  it('does not sort keys when not requested', () => {
    const result = formatJson({ c: 1, a: 2 }, 2, false)
    expect(result).toBe('{\n  "c": 1,\n  "a": 2\n}')
  })
})

describe('minifyJson', () => {
  it('minifies JSON object', () => {
    expect(minifyJson({ a: 1, b: 2 })).toBe('{"a":1,"b":2}')
  })

  it('minifies array', () => {
    expect(minifyJson([1, 2, 3])).toBe('[1,2,3]')
  })

  it('minifies nested structures', () => {
    expect(minifyJson({ a: { b: [1] } })).toBe('{"a":{"b":[1]}}')
  })
})
