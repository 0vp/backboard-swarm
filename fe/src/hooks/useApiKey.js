import { useState, useEffect, useCallback } from 'react'
import { getApiKey, setApiKey as setBackboardApiKey } from '../lib/backboard/client.js'

export function useApiKey() {
  const [apiKey, setApiKeyState] = useState('')
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    const key = getApiKey()
    setApiKeyState(key)
    setIsLoaded(true)
  }, [])

  const setApiKey = useCallback((key) => {
    setBackboardApiKey(key)
    setApiKeyState(key)
  }, [])

  const clearApiKey = useCallback(() => {
    setBackboardApiKey('')
    setApiKeyState('')
  }, [])

  return {
    apiKey,
    setApiKey,
    clearApiKey,
    isLoaded,
    hasApiKey: Boolean(apiKey),
  }
}
