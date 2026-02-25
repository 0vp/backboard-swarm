import { useCallback, useEffect, useState } from 'react'

import { threadsApi } from '../../lib/backboard/index.js'

function toArray(payload, key) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.[key])) return payload[key]
  if (Array.isArray(payload?.items)) return payload.items
  return []
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

function ThreadsSection() {
  const [threads, setThreads] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedThreadId, setExpandedThreadId] = useState(null)
  const [detailsByThread, setDetailsByThread] = useState({})
  const [messageDraftByThread, setMessageDraftByThread] = useState({})

  const loadThreads = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const payload = await threadsApi.list()
      const list = toArray(payload, 'threads').map(normalizeThread).filter((thread) => Boolean(thread.id))
      setThreads(list)
    } catch (loadError) {
      setError(loadError.message || 'Failed to load threads')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadThreads()
  }, [loadThreads])

  const loadThreadDetails = useCallback(async (threadId, { force = false } = {}) => {
    if (!threadId) return
    const current = detailsByThread[threadId]
    if (!force && current && !current.loading) return

    setDetailsByThread((previous) => ({
      ...previous,
      [threadId]: {
        ...(previous[threadId] || {}),
        loading: true,
      },
    }))

    try {
      const [messagesPayload, documentsPayload] = await Promise.all([
        threadsApi.listMessages(threadId),
        threadsApi.listDocuments(threadId),
      ])

      const messages = toArray(messagesPayload, 'messages')
      const documents = toArray(documentsPayload, 'documents').map(normalizeDocument).filter((document) => Boolean(document.id))

      setDetailsByThread((previous) => ({
        ...previous,
        [threadId]: {
          loading: false,
          messages,
          documents,
        },
      }))
    } catch (loadError) {
      setDetailsByThread((previous) => ({
        ...previous,
        [threadId]: {
          ...(previous[threadId] || {}),
          loading: false,
        },
      }))
      setError(loadError.message || 'Failed to load thread details')
    }
  }, [detailsByThread])

  const onToggleThread = async (threadId) => {
    if (expandedThreadId === threadId) {
      setExpandedThreadId(null)
      return
    }
    setExpandedThreadId(threadId)
    await loadThreadDetails(threadId)
  }

  const onDeleteThread = async (threadId) => {
    if (!threadId || !window.confirm('Delete this thread?')) return
    setError('')
    try {
      await threadsApi.delete(threadId)
      if (expandedThreadId === threadId) {
        setExpandedThreadId(null)
      }
      await loadThreads()
    } catch (deleteError) {
      setError(deleteError.message || 'Failed to delete thread')
    }
  }

  const onDeleteAllThreads = async () => {
    if (threads.length === 0) return
    if (!window.confirm(`Delete all ${threads.length} threads?`)) return

    setError('')
    try {
      await Promise.all(threads.map((thread) => threadsApi.delete(thread.id)))
      setExpandedThreadId(null)
      setDetailsByThread({})
      await loadThreads()
    } catch (deleteError) {
      setError(deleteError.message || 'Failed to delete all threads')
    }
  }

  const onSendMessage = async (threadId) => {
    const draft = (messageDraftByThread[threadId] || '').trim()
    if (!draft) return

    setError('')
    try {
      await threadsApi.addMessage(threadId, { content: draft })
      setMessageDraftByThread((previous) => ({ ...previous, [threadId]: '' }))
      await loadThreadDetails(threadId, { force: true })
    } catch (sendError) {
      setError(sendError.message || 'Failed to send message')
    }
  }

  const onUploadThreadDocument = async (threadId, file) => {
    if (!file) return
    setError('')
    try {
      await threadsApi.uploadDocument(threadId, file)
      await loadThreadDetails(threadId, { force: true })
    } catch (uploadError) {
      setError(uploadError.message || 'Failed to upload thread document')
    }
  }

  if (loading) {
    return <p className="text-zinc-400">Loading threads...</p>
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold text-white">Threads</h2>
        {threads.length > 0 && (
          <button
            type="button"
            onClick={onDeleteAllThreads}
            className="rounded border border-red-700/70 px-3 py-1.5 text-xs text-red-300 hover:bg-red-950/40"
          >
            Delete all threads
          </button>
        )}
      </div>
      <p className="text-sm text-zinc-400 mt-1">Review thread histories, message chats, and thread-level documents.</p>

      {error && (
        <div className="rounded border border-red-600/50 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {threads.length === 0 && (
          <div className="rounded border border-zinc-800 bg-zinc-950 px-4 py-6 text-sm text-zinc-400">No threads found.</div>
        )}

        {threads.map((thread) => {
          const details = detailsByThread[thread.id] || {}
          const draft = messageDraftByThread[thread.id] || ''
          const isExpanded = expandedThreadId === thread.id

          return (
            <article key={thread.id} className="rounded border border-zinc-800 bg-zinc-950">
              <button
                type="button"
                onClick={() => onToggleThread(thread.id)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-zinc-900"
              >
                <div>
                  <p className="text-sm font-medium text-white break-all">{thread.id}</p>
                  <p className="text-xs text-zinc-400">
                    {thread.created_at ? new Date(thread.created_at).toLocaleString() : 'No timestamp'}
                  </p>
                </div>
                <span className="text-xs text-zinc-400">{isExpanded ? 'Hide' : 'Show'}</span>
              </button>

              <div className="border-t border-zinc-800 px-4 py-3">
                <button
                  type="button"
                  onClick={() => onDeleteThread(thread.id)}
                  className="rounded border border-red-700/70 px-3 py-1.5 text-xs text-red-300 hover:bg-red-950/40"
                >
                  Delete thread
                </button>
              </div>

              {isExpanded && (
                <div className="border-t border-zinc-800 px-4 py-4 space-y-4">
                  {details.loading && <p className="text-sm text-zinc-400">Loading details...</p>}

                  {!details.loading && (
                    <>
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-zinc-100">Messages ({details.messages?.length || 0})</h4>
                        <div className="space-y-2 max-h-72 overflow-auto rounded border border-zinc-800 bg-zinc-900 p-3">
                          {(details.messages || []).map((message, index) => (
                            <div
                              key={message.message_id || index}
                              className="rounded border border-zinc-800 bg-zinc-950 p-2"
                            >
                              <p className="text-[11px] uppercase tracking-wide text-zinc-500">{message.role || 'unknown'}</p>
                              <p className="text-sm text-zinc-200 whitespace-pre-wrap">{message.content || '(empty)'}</p>
                            </div>
                          ))}
                          {(details.messages || []).length === 0 && (
                            <p className="text-xs text-zinc-500">No messages</p>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <input
                            value={draft}
                            onChange={(event) => setMessageDraftByThread((previous) => ({ ...previous, [thread.id]: event.target.value }))}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                onSendMessage(thread.id)
                              }
                            }}
                            placeholder="Send a new message"
                            className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                          />
                          <button
                            type="button"
                            onClick={() => onSendMessage(thread.id)}
                            className="purple-gradient-button rounded px-4 py-2 text-sm font-medium"
                          >
                            Send
                          </button>
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
                                if (file) onUploadThreadDocument(thread.id, file)
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

export default ThreadsSection
