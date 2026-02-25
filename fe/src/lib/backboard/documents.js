import { fetchBackboard } from './client.js'

function requireId(value, label) {
  if (!value || value === 'undefined') {
    throw new Error(`${label} is required`)
  }
  return value
}

export const documentsApi = {
  getStatus: (id) => fetchBackboard(`/documents/${requireId(id, 'Document ID')}/status`),

  delete: (id) => fetchBackboard(`/documents/${requireId(id, 'Document ID')}`, {
    method: 'DELETE',
  }),
}
