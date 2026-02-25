const BASE_URL = 'https://app.backboard.io/api'

let apiKey = localStorage.getItem('backboard_api_key') || ''

export function setApiKey(key) {
  apiKey = key
  if (key) {
    localStorage.setItem('backboard_api_key', key)
  } else {
    localStorage.removeItem('backboard_api_key')
  }
}

export function getApiKey() {
  return apiKey
}

export async function fetchBackboard(path, options = {}) {
  if (!apiKey) {
    throw new Error('API key is required. Please enter your Backboard API key.')
  }

  const url = `${BASE_URL}${path}`
  const headers = {
    'X-API-Key': apiKey,
    ...options.headers,
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })

  if (!response.ok) {
    let detail = `Request failed (${response.status})`
    try {
      const payload = await response.json()
      if (typeof payload?.detail === 'string') {
        detail = payload.detail
      } else if (payload?.detail) {
        detail = JSON.stringify(payload.detail)
      }
    } catch {
      detail = `Request failed (${response.status})`
    }
    throw new Error(detail)
  }

  if (response.status === 204) {
    return {}
  }

  return response.json()
}
