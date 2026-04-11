import { useCallback } from 'react'
import { useLocalStorage } from './use-local-storage'

export interface HistoryEntry {
  value: string
  timestamp: number
}

export function useHistory(key: string, maxItems = 10) {
  const [entries, setEntries] = useLocalStorage<HistoryEntry[]>(key, [])

  const addEntry = useCallback(
    (value: string) => {
      if (!value.trim()) return
      setEntries((prev) => {
        const filtered = prev.filter((e) => e.value !== value)
        return [{ value, timestamp: Date.now() }, ...filtered].slice(0, maxItems)
      })
    },
    [setEntries, maxItems],
  )

  const removeEntry = useCallback(
    (timestamp: number) => {
      setEntries((prev) => prev.filter((e) => e.timestamp !== timestamp))
    },
    [setEntries],
  )

  const clearHistory = useCallback(() => {
    setEntries([])
  }, [setEntries])

  return { entries, addEntry, removeEntry, clearHistory }
}
