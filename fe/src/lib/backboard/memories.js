import { fetchBackboard } from './client.js'

function requireId(value, label) {
  if (!value || value === 'undefined') {
    throw new Error(`${label} is required`)
  }
  return value
}

export const memoriesApi = {
  listForAssistant: (assistantId) =>
    fetchBackboard(`/assistants/${requireId(assistantId, 'Assistant ID')}/memories`),

  createForAssistant: (assistantId, data) =>
    fetchBackboard(`/assistants/${requireId(assistantId, 'Assistant ID')}/memories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  updateForAssistant: (assistantId, memoryId, data) =>
    fetchBackboard(`/assistants/${requireId(assistantId, 'Assistant ID')}/memories/${requireId(memoryId, 'Memory ID')}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  deleteForAssistant: (assistantId, memoryId) =>
    fetchBackboard(`/assistants/${requireId(assistantId, 'Assistant ID')}/memories/${requireId(memoryId, 'Memory ID')}`, {
      method: 'DELETE',
    }),
}
