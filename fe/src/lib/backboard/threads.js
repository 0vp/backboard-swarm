import { fetchBackboard } from './client.js'

function requireId(value, label) {
  if (!value || value === 'undefined') {
    throw new Error(`${label} is required`)
  }
  return value
}

export const threadsApi = {
  list: () => fetchBackboard('/threads'),

  delete: (id) => fetchBackboard(`/threads/${requireId(id, 'Thread ID')}`, {
    method: 'DELETE',
  }),

  listMessages: (id) => fetchBackboard(`/threads/${requireId(id, 'Thread ID')}/messages`),

  addMessage: (id, data) => fetchBackboard(`/threads/${requireId(id, 'Thread ID')}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),

  listDocuments: (id) => fetchBackboard(`/threads/${requireId(id, 'Thread ID')}/documents`),

  uploadDocument: (id, file) => {
    const formData = new FormData()
    formData.append('file', file)
    return fetchBackboard(`/threads/${requireId(id, 'Thread ID')}/documents`, {
      method: 'POST',
      body: formData,
    })
  },
}
