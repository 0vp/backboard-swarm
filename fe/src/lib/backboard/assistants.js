import { fetchBackboard } from './client.js'

function requireId(value, label) {
  if (!value || value === 'undefined') {
    throw new Error(`${label} is required`)
  }
  return value
}

export const assistantsApi = {
  list: () => fetchBackboard('/assistants'),

  create: (data) => fetchBackboard('/assistants', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),

  update: (id, data) => fetchBackboard(`/assistants/${requireId(id, 'Assistant ID')}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),

  delete: (id) => fetchBackboard(`/assistants/${requireId(id, 'Assistant ID')}`, {
    method: 'DELETE',
  }),

  listThreads: (id) => fetchBackboard(`/assistants/${requireId(id, 'Assistant ID')}/threads`),

  listDocuments: (id) => fetchBackboard(`/assistants/${requireId(id, 'Assistant ID')}/documents`),

  createThread: (id, data = {}) => fetchBackboard(`/assistants/${requireId(id, 'Assistant ID')}/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),

  uploadDocument: (id, file) => {
    const formData = new FormData()
    formData.append('file', file)
    return fetchBackboard(`/assistants/${requireId(id, 'Assistant ID')}/documents`, {
      method: 'POST',
      body: formData,
    })
  },
}
