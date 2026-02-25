import { useCallback, useEffect, useState } from 'react'

import { assistantsApi, memoriesApi, threadsApi } from '../../lib/backboard/index.js'

function toArray(payload, key) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.[key])) return payload[key]
  if (Array.isArray(payload?.items)) return payload.items
  return []
}

function normalizeAssistant(assistant) {
  return {
    ...assistant,
    id: assistant.id || assistant.assistant_id,
  }
}

function normalizeThread(thread) {
  return {
    ...thread,
    id: thread.id || thread.thread_id,
  }
}

function normalizeDocument(document) {
  return {
    ...document,
    id: document.id || document.document_id,
  }
}

const emptyAssistantForm = {
  name: '',
  model: '',
  description: '',
  instructions: '',
}

const emptyMemoryForm = {
  content: '',
  metadata: '',
}

function AssistantsSection() {
  const [assistants, setAssistants] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copiedAssistantId, setCopiedAssistantId] = useState(null)
  const [expandedAssistantId, setExpandedAssistantId] = useState(null)
  const [detailsByAssistant, setDetailsByAssistant] = useState({})
  const [assistantForm, setAssistantForm] = useState(emptyAssistantForm)
  const [editingAssistantId, setEditingAssistantId] = useState(null)
  const [memoryFormByAssistant, setMemoryFormByAssistant] = useState({})

  const copyTextToClipboard = useCallback(async (text) => {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return
    }

    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'absolute'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }, [])

  const loadAssistants = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const payload = await assistantsApi.list()
      const list = toArray(payload, 'assistants').map(normalizeAssistant).filter((assistant) => Boolean(assistant.id))
      setAssistants(list)
    } catch (loadError) {
      setError(loadError.message || 'Failed to load assistants')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAssistants()
  }, [loadAssistants])

  const loadAssistantDetails = useCallback(async (assistantId, { force = false } = {}) => {
    if (!assistantId) return

    const existing = detailsByAssistant[assistantId]
    if (!force && existing && !existing.loading) return

    setDetailsByAssistant((previous) => ({
      ...previous,
      [assistantId]: {
        ...(previous[assistantId] || {}),
        loading: true,
      },
    }))

    try {
      const [threadsPayload, documentsPayload, memoriesPayload] = await Promise.all([
        assistantsApi.listThreads(assistantId),
        assistantsApi.listDocuments(assistantId),
        memoriesApi.listForAssistant(assistantId),
      ])

      const threads = toArray(threadsPayload, 'threads').map(normalizeThread).filter((thread) => Boolean(thread.id))
      const documents = toArray(documentsPayload, 'documents').map(normalizeDocument).filter((document) => Boolean(document.id))
      const memories = toArray(memoriesPayload, 'memories')

      setDetailsByAssistant((previous) => ({
        ...previous,
        [assistantId]: {
          loading: false,
          threads,
          documents,
          memories,
        },
      }))
    } catch (loadError) {
      setDetailsByAssistant((previous) => ({
        ...previous,
        [assistantId]: {
          ...(previous[assistantId] || {}),
          loading: false,
          threads: previous[assistantId]?.threads || [],
          documents: previous[assistantId]?.documents || [],
          memories: previous[assistantId]?.memories || [],
        },
      }))
      setError(loadError.message || 'Failed to load assistant details')
    }
  }, [detailsByAssistant])

  const onToggleAssistant = async (assistantId) => {
    if (expandedAssistantId === assistantId) {
      setExpandedAssistantId(null)
      return
    }
    setExpandedAssistantId(assistantId)
    await loadAssistantDetails(assistantId)
  }

  const onSubmitAssistant = async (event) => {
    event.preventDefault()
    setError('')

    try {
      if (editingAssistantId) {
        await assistantsApi.update(editingAssistantId, assistantForm)
      } else {
        await assistantsApi.create(assistantForm)
      }
      setAssistantForm(emptyAssistantForm)
      setEditingAssistantId(null)
      await loadAssistants()
    } catch (saveError) {
      setError(saveError.message || 'Failed to save assistant')
    }
  }

  const onEditAssistant = (assistant) => {
    setEditingAssistantId(assistant.id)
    setAssistantForm({
      name: assistant.name || '',
      model: assistant.model || '',
      description: assistant.description || '',
      instructions: assistant.instructions || '',
    })
  }

  const onDeleteAssistant = async (assistantId) => {
    if (!assistantId || !window.confirm('Delete this assistant?')) return
    setError('')
    try {
      await assistantsApi.delete(assistantId)
      if (expandedAssistantId === assistantId) {
        setExpandedAssistantId(null)
      }
      await loadAssistants()
    } catch (deleteError) {
      setError(deleteError.message || 'Failed to delete assistant')
    }
  }

  const onDeleteAllAssistants = async () => {
    if (assistants.length === 0) return
    if (!window.confirm(`Delete all ${assistants.length} assistants?`)) return

    setError('')
    try {
      await Promise.all(assistants.map((assistant) => assistantsApi.delete(assistant.id)))
      setExpandedAssistantId(null)
      setDetailsByAssistant({})
      await loadAssistants()
    } catch (deleteError) {
      setError(deleteError.message || 'Failed to delete all assistants')
    }
  }

  const onCreateThread = async (assistantId) => {
    setError('')
    try {
      await assistantsApi.createThread(assistantId)
      await loadAssistantDetails(assistantId, { force: true })
    } catch (createError) {
      setError(createError.message || 'Failed to create thread')
    }
  }

  const onDeleteThread = async (assistantId, threadId) => {
    if (!threadId || !window.confirm('Delete this thread?')) return
    setError('')
    try {
      await threadsApi.delete(threadId)
      await loadAssistantDetails(assistantId, { force: true })
    } catch (deleteError) {
      setError(deleteError.message || 'Failed to delete thread')
    }
  }

  const onDeleteAllThreads = async (assistantId) => {
    const threadIds = (detailsByAssistant[assistantId]?.threads || []).map((thread) => thread.id).filter(Boolean)
    if (threadIds.length === 0) return
    if (!window.confirm(`Delete all ${threadIds.length} threads for this assistant?`)) return

    setError('')
    try {
      await Promise.all(threadIds.map((threadId) => threadsApi.delete(threadId)))
      await loadAssistantDetails(assistantId, { force: true })
    } catch (deleteError) {
      setError(deleteError.message || 'Failed to delete all threads')
    }
  }

  const onUploadAssistantDocument = async (assistantId, file) => {
    if (!file) return
    setError('')
    try {
      await assistantsApi.uploadDocument(assistantId, file)
      await loadAssistantDetails(assistantId, { force: true })
    } catch (uploadError) {
      setError(uploadError.message || 'Failed to upload document')
    }
  }

  const onMemoryFormChange = (assistantId, updates) => {
    setMemoryFormByAssistant((previous) => ({
      ...previous,
      [assistantId]: {
        ...(previous[assistantId] || emptyMemoryForm),
        ...updates,
      },
    }))
  }

  const onSaveMemory = async (assistantId, memoryId = null) => {
    const memoryForm = memoryFormByAssistant[assistantId] || emptyMemoryForm
    if (!memoryForm.content.trim()) {
      setError('Memory content is required')
      return
    }

    setError('')
    try {
      const payload = {
        content: memoryForm.content.trim(),
      }

      const metadataText = memoryForm.metadata?.trim()
      if (metadataText) {
        payload.metadata = JSON.parse(metadataText)
      }

      if (memoryId) {
        await memoriesApi.updateForAssistant(assistantId, memoryId, payload)
      } else {
        await memoriesApi.createForAssistant(assistantId, payload)
      }

      onMemoryFormChange(assistantId, emptyMemoryForm)
      await loadAssistantDetails(assistantId, { force: true })
    } catch (saveError) {
      setError(saveError.message || 'Failed to save memory')
    }
  }

  const onDeleteMemory = async (assistantId, memoryId) => {
    if (!memoryId || !window.confirm('Delete this memory?')) return
    setError('')
    try {
      await memoriesApi.deleteForAssistant(assistantId, memoryId)
      await loadAssistantDetails(assistantId, { force: true })
    } catch (deleteError) {
      setError(deleteError.message || 'Failed to delete memory')
    }
  }

  const onDeleteAllMemories = async (assistantId) => {
    const memoryIds = (detailsByAssistant[assistantId]?.memories || []).map((memory) => memory.id).filter(Boolean)
    if (memoryIds.length === 0) return
    if (!window.confirm(`Delete all ${memoryIds.length} memories for this assistant?`)) return

    setError('')
    try {
      await Promise.all(memoryIds.map((memoryId) => memoriesApi.deleteForAssistant(assistantId, memoryId)))
      await loadAssistantDetails(assistantId, { force: true })
    } catch (deleteError) {
      setError(deleteError.message || 'Failed to delete all memories')
    }
  }

  const onCopyAssistantId = async (event, assistantId) => {
    event.stopPropagation()
    if (!assistantId) return

    try {
      await copyTextToClipboard(assistantId)
      setCopiedAssistantId(assistantId)
      setTimeout(() => {
        setCopiedAssistantId((current) => (current === assistantId ? null : current))
      }, 1200)
    } catch {
      setError('Failed to copy assistant ID')
    }
  }

  if (loading) {
    return <p className="text-zinc-400">Loading assistants...</p>
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold text-white">Assistants</h2>
        {assistants.length > 0 && (
          <button
            type="button"
            onClick={onDeleteAllAssistants}
            className="rounded border border-red-700/70 px-3 py-1.5 text-xs text-red-300 hover:bg-red-950/40"
          >
            Delete all assistants
          </button>
        )}
      </div>
      <p className="text-sm text-zinc-400 mt-1">Create assistants and inspect their threads, documents, and memories.</p>

      {error && (
        <div className="rounded border border-red-600/50 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <form onSubmit={onSubmitAssistant} className="rounded border border-zinc-800 bg-zinc-950 p-4 space-y-3">
        <h3 className="text-sm font-medium text-zinc-200">{editingAssistantId ? 'Edit assistant' : 'Create assistant'}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            value={assistantForm.name}
            onChange={(event) => setAssistantForm((previous) => ({ ...previous, name: event.target.value }))}
            placeholder="Name"
            required
            className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
          />
          <input
            value={assistantForm.model}
            onChange={(event) => setAssistantForm((previous) => ({ ...previous, model: event.target.value }))}
            placeholder="Model (optional)"
            className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
          />
        </div>
        <input
          value={assistantForm.description}
          onChange={(event) => setAssistantForm((previous) => ({ ...previous, description: event.target.value }))}
          placeholder="Description"
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
        />
        <textarea
          value={assistantForm.instructions}
          onChange={(event) => setAssistantForm((previous) => ({ ...previous, instructions: event.target.value }))}
          placeholder="Instructions"
          rows={3}
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
        />
        <div className="flex gap-2">
          <button type="submit" className="rounded bg-zinc-200 px-4 py-2 text-sm font-medium text-black hover:bg-white">
            {editingAssistantId ? 'Update' : 'Create'}
          </button>
          {editingAssistantId && (
            <button
              type="button"
              onClick={() => {
                setEditingAssistantId(null)
                setAssistantForm(emptyAssistantForm)
              }}
              className="rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-900"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="space-y-3">
        {assistants.length === 0 && (
          <div className="rounded border border-zinc-800 bg-zinc-950 px-4 py-6 text-sm text-zinc-400">No assistants found.</div>
        )}

        {assistants.map((assistant) => {
          const details = detailsByAssistant[assistant.id] || {}
          const memoryForm = memoryFormByAssistant[assistant.id] || emptyMemoryForm
          const isExpanded = expandedAssistantId === assistant.id

          return (
            <article key={assistant.id} className="rounded border border-zinc-800 bg-zinc-950">
              <button
                type="button"
                onClick={() => onToggleAssistant(assistant.id)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-zinc-900"
              >
                <div>
                  <p className="text-sm font-medium text-white">{assistant.name || assistant.id}</p>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-zinc-400 break-all">{assistant.id}</p>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        void onCopyAssistantId(event, assistant.id)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          void onCopyAssistantId(event, assistant.id)
                        }
                      }}
                      className="text-[11px] text-zinc-300 border border-zinc-700 rounded px-1.5 py-0.5 hover:bg-zinc-800"
                    >
                      {copiedAssistantId === assistant.id ? 'Copied' : 'Copy'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400">{isExpanded ? 'Hide' : 'Show'}</span>
                </div>
              </button>

              <div className="border-t border-zinc-800 px-4 py-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => onEditAssistant(assistant)}
                  className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-900"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteAssistant(assistant.id)}
                  className="rounded border border-red-700/70 px-3 py-1.5 text-xs text-red-300 hover:bg-red-950/40"
                >
                  Delete
                </button>
              </div>

              {isExpanded && (
                <div className="border-t border-zinc-800 px-4 py-4 space-y-4">
                  {details.loading && <p className="text-sm text-zinc-400">Loading details...</p>}

                  {!details.loading && (
                    <>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-medium text-zinc-100">Threads ({details.threads?.length || 0})</h4>
                          <div className="flex gap-2">
                            {(details.threads?.length || 0) > 0 && (
                              <button
                                type="button"
                                onClick={() => onDeleteAllThreads(assistant.id)}
                                className="rounded border border-red-700/70 px-2 py-1 text-xs text-red-300 hover:bg-red-950/40"
                              >
                                Delete all
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onCreateThread(assistant.id)}
                              className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-900"
                            >
                              New thread
                            </button>
                          </div>
                        </div>
                        <div className="space-y-1">
                          {(details.threads || []).map((thread) => (
                            <div key={thread.id} className="rounded border border-zinc-800 bg-zinc-900 px-3 py-2 flex items-center justify-between">
                              <p className="text-xs text-zinc-300 break-all">{thread.id}</p>
                              <button
                                type="button"
                                onClick={() => onDeleteThread(assistant.id, thread.id)}
                                className="rounded border border-red-700/70 px-2 py-1 text-xs text-red-300 hover:bg-red-950/40"
                              >
                                Delete
                              </button>
                            </div>
                          ))}
                          {(details.threads || []).length === 0 && (
                            <p className="text-xs text-zinc-500">No threads</p>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-medium text-zinc-100">Documents ({details.documents?.length || 0})</h4>
                          <label className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-900 cursor-pointer">
                            Upload
                            <input
                              type="file"
                              className="hidden"
                              onChange={(event) => {
                                const file = event.target.files?.[0]
                                if (file) onUploadAssistantDocument(assistant.id, file)
                                event.target.value = ''
                              }}
                            />
                          </label>
                        </div>
                        <div className="space-y-1">
                          {(details.documents || []).map((document) => (
                            <div key={document.id} className="rounded border border-zinc-800 bg-zinc-900 px-3 py-2">
                              <p className="text-xs text-zinc-300 break-all">{document.filename || document.id}</p>
                              <p className="text-[11px] text-zinc-500 mt-1">Status: {document.status || 'unknown'}</p>
                            </div>
                          ))}
                          {(details.documents || []).length === 0 && (
                            <p className="text-xs text-zinc-500">No documents</p>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-medium text-zinc-100">Memories ({details.memories?.length || 0})</h4>
                          {(details.memories?.length || 0) > 0 && (
                            <button
                              type="button"
                              onClick={() => onDeleteAllMemories(assistant.id)}
                              className="rounded border border-red-700/70 px-2 py-1 text-xs text-red-300 hover:bg-red-950/40"
                            >
                              Delete all
                            </button>
                          )}
                        </div>
                        <div className="space-y-2">
                          {(details.memories || []).map((memory) => (
                            <div key={memory.id} className="rounded border border-zinc-800 bg-zinc-900 px-3 py-2 space-y-2">
                              <p className="text-sm text-zinc-200 whitespace-pre-wrap">{memory.content}</p>
                              {memory.metadata && Object.keys(memory.metadata).length > 0 && (
                                <pre className="rounded bg-zinc-950 px-2 py-1 text-[11px] text-zinc-400 overflow-auto">
                                  {JSON.stringify(memory.metadata, null, 2)}
                                </pre>
                              )}
                              <button
                                type="button"
                                onClick={() => onDeleteMemory(assistant.id, memory.id)}
                                className="rounded border border-red-700/70 px-2 py-1 text-xs text-red-300 hover:bg-red-950/40"
                              >
                                Delete
                              </button>
                            </div>
                          ))}
                          {(details.memories || []).length === 0 && (
                            <p className="text-xs text-zinc-500">No memories</p>
                          )}
                        </div>

                        <div className="rounded border border-zinc-800 bg-zinc-900 p-3 space-y-2">
                          <p className="text-xs font-medium text-zinc-200">Add or update memory</p>
                          <textarea
                            rows={3}
                            value={memoryForm.content}
                            onChange={(event) => onMemoryFormChange(assistant.id, { content: event.target.value })}
                            placeholder="Memory content"
                            className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
                          />
                          <textarea
                            rows={2}
                            value={memoryForm.metadata}
                            onChange={(event) => onMemoryFormChange(assistant.id, { metadata: event.target.value })}
                            placeholder='Metadata JSON (optional), e.g. {"topic":"roads"}'
                            className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => onSaveMemory(assistant.id)}
                              className="rounded bg-zinc-200 px-3 py-1.5 text-xs font-medium text-black hover:bg-white"
                            >
                              Save memory
                            </button>
                            {details.memories?.[0]?.id && (
                              <button
                                type="button"
                                onClick={() => onSaveMemory(assistant.id, details.memories[0].id)}
                                className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-950"
                              >
                                Update first memory
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}

export default AssistantsSection
