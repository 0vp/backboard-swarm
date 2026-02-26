import { useState, useEffect, useRef, useCallback } from 'react'
import {
  FaPaperPlane,
  FaTerminal,
  FaFileLines,
  FaFolderOpen,
  FaCode,
  FaBolt,
  FaCircleXmark,
  FaChevronDown,
  FaChevronRight,
  FaRobot,
  FaGlobe,
  FaXmark,
  FaMagnifyingGlass,
  FaRegMessage
} from 'react-icons/fa6'
import { CheckCircle2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Dither from '../components/art/Dither'

const WS_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`
const API_URL = '/tasks'

const stringifyContent = (value) => {
  if (typeof value === 'string') return value
  if (value == null) return ''
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const parseMaybeJSON = (value) => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) return value
  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}

const objectToMarkdown = (value) => {
  if (!value || typeof value !== 'object') return stringifyContent(value)
  const lines = Object.entries(value).map(([key, val]) => {
    const label = key.replace(/_/g, ' ')
    if (Array.isArray(val)) {
      if (val.length === 0) return `- **${label}:**`
      return `- **${label}:**\n${val.map(item => `  - ${typeof item === 'object' ? stringifyContent(item) : String(item)}`).join('\n')}`
    }
    if (val && typeof val === 'object') {
      return `- **${label}:** ${stringifyContent(val)}`
    }
    return `- **${label}:** ${val == null ? '' : String(val)}`
  })
  return lines.join('\n')
}

const getFinalSummaryContent = (message) => {
  const parsed = parseMaybeJSON(message)
  if (typeof parsed === 'string') return parsed
  if (!parsed || typeof parsed !== 'object') return stringifyContent(parsed)

  if (typeof parsed.summary === 'string') return parsed.summary
  if (parsed.summary && typeof parsed.summary === 'object') {
    if (typeof parsed.summary.markdown === 'string') return parsed.summary.markdown
    if (typeof parsed.summary.message === 'string') return parsed.summary.message
    if (typeof parsed.summary.text === 'string') return parsed.summary.text
    return objectToMarkdown(parsed.summary)
  }

  if (typeof parsed.message === 'string') return parsed.message
  if (typeof parsed.text === 'string') return parsed.text
  return objectToMarkdown(parsed)
}

const MarkdownMessage = ({ content, className = '' }) => (
  <div className={`whitespace-normal break-words [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:border [&_pre]:border-zinc-700 [&_pre]:bg-zinc-950/70 [&_pre]:p-2 [&_code]:rounded [&_code]:bg-zinc-900 [&_code]:px-1 [&_code]:py-0.5 [&_blockquote]:border-l-2 [&_blockquote]:border-[#ff5aa8] [&_blockquote]:pl-3 [&_table]:w-full [&_table]:border-collapse [&_table]:my-3 [&_th]:border [&_th]:border-zinc-700 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_th]:bg-zinc-800 [&_th]:text-zinc-200 [&_td]:border [&_td]:border-zinc-700 [&_td]:px-3 [&_td]:py-2 [&_td]:text-xs [&_td]:text-zinc-300 [&_tr:nth-child(even)]:bg-zinc-900/50 [&_hr]:my-4 [&_hr]:border-zinc-700 ${className}`}>
    <ReactMarkdown remarkPlugins={[remarkGfm]}>
      {stringifyContent(content)}
    </ReactMarkdown>
  </div>
)

const getToolIcon = (toolName) => {
  if (!toolName) return <FaBolt className="w-4 h-4" />
  const lower = toolName.toLowerCase()
  if (lower.includes('read') || lower.includes('view')) return <FaFileLines className="w-4 h-4 text-[#ff5aa8]" />
  if (lower.includes('list') || lower.includes('ls')) return <FaFolderOpen className="w-4 h-4 text-[#ff5aa8]" />
  if (lower.includes('patch') || lower.includes('write')) return <FaCode className="w-4 h-4 text-[#ff5aa8]" />
  if (lower.includes('exec') || lower.includes('run')) return <FaTerminal className="w-4 h-4 text-[#ff5aa8]" />
  if (lower.includes('search')) return <FaMagnifyingGlass className="w-4 h-4 text-[#ff5aa8]" />
  if (lower.includes('web')) return <FaGlobe className="w-4 h-4 text-[#ff5aa8]" />
  return <FaBolt className="w-4 h-4 text-[#ff5aa8]" />
}

const getToolLabel = (toolName, message) => {
  if (!toolName) return 'Agent Action'
  let label = toolName.replace(/_/g, ' ')
  label = label.charAt(0).toUpperCase() + label.slice(1)
  
  // try to extract some useful path or argument info if possible from message
  const rawMessage = stringifyContent(message)
  const match = rawMessage.match(/args=\{([^}]+)\}/)
  if (match) {
    try {
      const args = match[1]
      return `${label} (${args})`
    } catch(e) {}
  }
  
  return label
}

const ToolCallNode = ({ event, results }) => {
  const [expanded, setExpanded] = useState(false)
  const resultEvent = results.find(r => r.Meta?.tool_index === event.Meta?.tool_index)
  const isFinished = !!resultEvent
  const isError = resultEvent?.Status === 'error'
  const agentLabel = event.AgentID || 'unknown-agent'

  return (
    <div className="flex flex-col ml-6 my-1">
      <div 
        className="flex items-center gap-2 text-zinc-300 hover:text-white cursor-pointer group py-1"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-center w-4 h-4 shrink-0">
          {expanded ? <FaChevronDown className="w-3 h-3 text-zinc-500 group-hover:text-zinc-300" /> : <FaChevronRight className="w-3 h-3 text-zinc-500 group-hover:text-zinc-300" />}
        </div>
        <div className="shrink-0">{getToolIcon(event.ToolName)}</div>
        <span
          className="text-sm font-medium flex-1 min-w-0 leading-5 overflow-hidden text-ellipsis whitespace-nowrap"
          title={getToolLabel(event.ToolName, event.Message)}
        >
          {getToolLabel(event.ToolName, event.Message)}
        </span>
        <span className="ml-2 rounded-full border border-[#ff5aa8]/40 bg-[#ff5aa8]/10 px-2 py-0.5 text-[10px] font-medium text-[#ff8ec8] shrink-0">
          {agentLabel}
        </span>

        <div className="ml-2 shrink-0 w-3.5 h-3.5 flex items-center justify-center">
          {isFinished ? (
            isError ? <FaCircleXmark className="w-3.5 h-3.5 text-red-500" /> : <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
          ) : (
            <div className="w-1.5 h-1.5 rounded-full bg-[#ff5aa8] animate-pulse shadow-[0_0_6px_#ff5aa8]" />
          )}
        </div>
      </div>

      {expanded && (
        <div className="ml-6 pl-2 border-l-2 border-zinc-800 my-1 font-mono text-xs text-zinc-400 space-y-2">
          <div>
            <span className="text-zinc-500">Agent: </span>
            <span className="text-[#ff8ec8]">{agentLabel}</span>
          </div>
          <div>
            <span className="text-zinc-500">Command: </span>
            <span className="text-zinc-300">{event.ToolName}</span>
          </div>
          <div>
            <span className="text-zinc-500">Details: </span>
            <MarkdownMessage content={event.Message} className="text-zinc-300 break-all" />
          </div>
          {isFinished && (
            <div>
              <span className="text-zinc-500">{isError ? 'Error:' : 'Output:'} </span>
              <div className="theme-scrollbar bg-zinc-900 p-2 rounded mt-1 border border-zinc-800 overflow-x-auto max-h-40 overflow-y-auto">
                <MarkdownMessage content={resultEvent.Message} className="text-zinc-200" />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const toTimestampMs = (value) => {
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}

const formatSeconds = (value) => {
  if (!Number.isFinite(value) || value < 0) return '—'
  return `${value.toFixed(value >= 100 ? 0 : 2)}s`
}

const isOrchestratorEvent = (event) => {
  const role = String(event?.Role || '').toLowerCase()
  return event?.AgentID === 'agent-0' || role === 'orchestrator'
}

const getRunLatencyMetrics = (run) => {
  if (!run?.events?.length) return null

  const startedEvent = run.events.find(e => e.Type === 'swarm_started')
  const finishedEvent = [...run.events].reverse().find(e => e.Type === 'swarm_finished')

  const startedMs = toTimestampMs(startedEvent?.Timestamp)
  const finishedMs = toTimestampMs(finishedEvent?.Timestamp)

  if (startedMs == null || finishedMs == null || finishedMs < startedMs) return null

  const timedEvents = run.events
    .map((event) => ({ event, ts: toTimestampMs(event.Timestamp) }))
    .filter((entry) => entry.ts != null)
    .sort((a, b) => a.ts - b.ts)

  const planReadyBoundaries = Array.from(new Set(
    timedEvents
      .filter(({ event, ts }) => (
        ts >= startedMs
        && ts <= finishedMs
        && event.Type === 'agent_status'
        && String(event.Status || '').toLowerCase() === 'plan_ready'
        && isOrchestratorEvent(event)
      ))
      .map(({ ts }) => ts)
  ))

  const segments = []
  if (planReadyBoundaries.length === 0) {
    segments.push({ start: startedMs, end: finishedMs })
  } else {
    if (planReadyBoundaries[0] > startedMs) {
      segments.push({ start: startedMs, end: planReadyBoundaries[0] })
    }
    for (let i = 0; i < planReadyBoundaries.length; i++) {
      const start = planReadyBoundaries[i]
      const end = i + 1 < planReadyBoundaries.length ? planReadyBoundaries[i + 1] : finishedMs
      if (end > start) {
        segments.push({ start, end })
      }
    }
  }

  let swarmSeconds = 0
  let classicSeconds = 0
  let orchestratorSeconds = 0
  const workerTotals = new Map()

  segments.forEach((segment, index) => {
    const isLast = index === segments.length - 1
    const segmentEvents = timedEvents.filter(({ ts }) => ts >= segment.start && (isLast ? ts <= segment.end : ts < segment.end))

    const workerWindows = new Map()
    segmentEvents.forEach(({ event, ts }) => {
      if (isOrchestratorEvent(event)) return
      if (!event?.AgentID) return
      const current = workerWindows.get(event.AgentID) || { start: ts, end: ts }
      current.start = Math.min(current.start, ts)
      current.end = Math.max(current.end, ts)
      workerWindows.set(event.AgentID, current)
    })

    const workers = Array.from(workerWindows.entries()).map(([agentID, window]) => ({
      agentID,
      start: window.start,
      end: window.end,
      seconds: Math.max(0, (window.end - window.start) / 1000),
    }))

    if (workers.length === 0) {
      const onlyOrchestrator = Math.max(0, (segment.end - segment.start) / 1000)
      orchestratorSeconds += onlyOrchestrator
      swarmSeconds += onlyOrchestrator
      classicSeconds += onlyOrchestrator
      return
    }

    const firstWorkerStart = Math.min(...workers.map((w) => w.start))
    const lastWorkerEnd = Math.max(...workers.map((w) => w.end))
    const orchestrationBlock = Math.max(0, (firstWorkerStart - segment.start) / 1000) + Math.max(0, (segment.end - lastWorkerEnd) / 1000)
    const longestWorker = Math.max(...workers.map((w) => w.seconds))
    const sumWorkers = workers.reduce((sum, worker) => sum + worker.seconds, 0)

    orchestratorSeconds += orchestrationBlock
    swarmSeconds += orchestrationBlock + longestWorker
    classicSeconds += orchestrationBlock + sumWorkers

    workers.forEach((worker) => {
      workerTotals.set(worker.agentID, (workerTotals.get(worker.agentID) || 0) + worker.seconds)
    })
  })

  const agentDurations = [
    { agentID: 'agent-0', seconds: orchestratorSeconds },
    ...Array.from(workerTotals.entries()).map(([agentID, seconds]) => ({ agentID, seconds })),
  ]
    .filter(item => item.seconds > 0)
    .sort((a, b) => {
      const aNum = Number((a.agentID.match(/agent-(\d+)/) || [])[1])
      const bNum = Number((b.agentID.match(/agent-(\d+)/) || [])[1])
      if (Number.isFinite(aNum) && Number.isFinite(bNum)) return aNum - bNum
      return a.agentID.localeCompare(b.agentID)
    })

  const speedup = swarmSeconds > 0 && classicSeconds > 0 ? classicSeconds / swarmSeconds : null

  return {
    swarmSeconds,
    linearSeconds: classicSeconds,
    speedup,
    agentDurations,
  }
}

const AgentRunMessage = ({ run }) => {
  const [expanded, setExpanded] = useState(true)
  
  const isFinished = run.status === 'completed' || run.status === 'failed'
  const isError = run.status === 'failed'

  const toolResults = run.events.filter(e => e.Type === 'tool_result')
  const summaryEvent = run.events.find(e => e.Type === 'swarm_finished')
  const timelineEvents = run.events.filter((e) => {
    if (e.Type === 'tool_call') return e.ToolName !== 'message'
    return e.Type === 'agent_status' && String(e.Status || '').toLowerCase() === 'message'
  })
  const latencyMetrics = getRunLatencyMetrics(run)

  return (
    <div className="w-full bg-[#111111]/80 backdrop-blur-md border border-zinc-800/80 rounded-xl p-4 mb-4 transition-all hover:border-zinc-700/80">
      <div className="flex items-start justify-between">
        <div 
          className="flex items-start gap-3 cursor-pointer group flex-1"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="shrink-0 w-5 h-5 flex items-center justify-center mt-0.5">
            {isFinished ? (
              isError ? <FaCircleXmark className="w-5 h-5 text-red-500" /> : <CheckCircle2 className="w-5 h-5 text-green-500" />
            ) : (
              <div className="w-2 h-2 rounded-full bg-[#ff5aa8] animate-pulse shadow-[0_0_8px_#ff5aa8]" />
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="text-zinc-200 text-sm font-medium leading-relaxed mb-1 pr-4 break-words">
              {run.task}
            </h3>
          </div>
          
          <div className="flex items-center text-zinc-500 shrink-0">
            {expanded ? <FaChevronDown className="w-4 h-4" /> : <FaChevronRight className="w-4 h-4" />}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 flex flex-col gap-1 border-t border-zinc-800/50 pt-4">
          {timelineEvents.map((evt, i) => {
            if (evt.Type === 'agent_status') {
              return <AgentStatusMessage key={`${evt.RunID}-${evt.Timestamp}-${i}-msg`} event={evt} />
            }
            return <ToolCallNode key={`${evt.RunID}-${evt.Timestamp}-${i}-tool`} event={evt} results={toolResults} />
          })}
          
          {!isFinished && timelineEvents.length === 0 && (
            <div className="ml-6 flex items-center gap-2 text-zinc-500 text-sm">
              <div className="w-2 h-2 rounded-full bg-[#ff5aa8] animate-pulse shadow-[0_0_8px_#ff5aa8]" />
              Thinking...
            </div>
          )}

          {summaryEvent && (
            <div className="mt-4 bg-[#1A1A1A] rounded-lg p-4 text-sm text-zinc-300 border border-zinc-800">
              <div className="flex items-center gap-2 mb-2 text-[#ff5aa8] font-medium">
                <FaRobot className="w-4 h-4" /> Final Summary
              </div>
              <MarkdownMessage content={getFinalSummaryContent(summaryEvent.Message)} className="text-zinc-300" />
            </div>
          )}

          {summaryEvent && latencyMetrics && (
            <div className="mt-4 bg-[#1A1A1A] rounded-lg p-4 text-sm text-zinc-300 border border-zinc-800">
              <div className="flex items-center justify-between gap-4 text-xs sm:text-sm">
                <div>
                  <span className="text-zinc-500">Swarm</span>
                  <div className="text-[#ff8ec8] font-medium">{formatSeconds(latencyMetrics.swarmSeconds)}</div>
                </div>
                <div>
                  <span className="text-zinc-500">Classic</span>
                  <div className="text-[#ff8ec8] font-medium">{formatSeconds(latencyMetrics.linearSeconds)}</div>
                </div>
                <div>
                  <span className="text-zinc-500">Latency speedup</span>
                  <div className="text-green-400 font-medium">
                    {Number.isFinite(latencyMetrics.speedup) ? `${latencyMetrics.speedup.toFixed(2)}x` : '—'}
                  </div>
                </div>
              </div>

              {latencyMetrics.agentDurations.length > 0 && (
                <div className="mt-3 pt-3 border-t border-zinc-800 flex flex-wrap gap-2">
                  {latencyMetrics.agentDurations.map((item) => (
                    <span key={item.agentID} className="rounded-full border border-zinc-700 bg-zinc-900/60 px-2 py-0.5 text-[11px] text-zinc-300">
                      {item.agentID}: {formatSeconds(item.seconds)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const UserMessage = ({ content }) => {
  return (
    <div className="w-full flex justify-end mb-4 pr-2">
      <div className="max-w-[80%] bg-zinc-800 rounded-2xl rounded-tr-sm px-4 py-3 text-zinc-100 text-sm shadow-sm border border-zinc-700/50">
        {content}
      </div>
    </div>
  )
}

const AgentStatusMessage = ({ event }) => {
  const agentLabel = event.AgentID || 'agent'
  return (
    <div className="w-full flex justify-start mb-3">
      <div className="max-w-[85%] bg-[#1A1A1A] rounded-lg p-4 text-sm text-zinc-300">
        <div className="text-[10px] uppercase tracking-wide text-[#ff8ec8] mb-1">{agentLabel}</div>
        <MarkdownMessage content={event.Message} className="text-zinc-300" />
      </div>
    </div>
  )
}

const AgentsSidebar = ({ agents, isOpen, onClose }) => {
  if (!isOpen) return null;
  
  return (
    <div className="absolute right-0 top-0 bottom-0 w-64 bg-[#0D0D0D] border-l-2 border-[#1A1A1A] z-20 flex flex-col animate-fade-in shadow-2xl">
      <div className="flex items-center justify-between p-4 border-b border-[#1A1A1A]">
        <h3 className="text-white font-medium flex items-center gap-2">
          <FaRobot className="w-4 h-4 text-[#ff5aa8]" /> Active Agents
        </h3>
        <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors cursor-pointer">
          <FaXmark className="w-4 h-4" />
        </button>
      </div>
      <div className="theme-scrollbar flex-1 overflow-y-auto p-4 space-y-4">
        {agents.length === 0 ? (
          <p className="text-zinc-500 text-xs text-center mt-4">No agents active yet.</p>
        ) : (
          agents.map((agent, i) => (
            <div key={i} className="bg-zinc-900 rounded-lg p-3 border border-zinc-800">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-white text-sm font-medium">{agent.id}</span>
              </div>
              <p className="text-zinc-400 text-xs capitalize">Role: {agent.role}</p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default function Agent() {
  const [runs, setRuns] = useState([])
  const [input, setInput] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const [showAgents, setShowAgents] = useState(false)
  const [activeAgents, setActiveAgents] = useState([])
  const wsRef = useRef(null)
  const reconnectTimerRef = useRef(null)
  const shouldReconnectRef = useRef(true)
  const seenEventsRef = useRef(new Set())
  const messagesEndRef = useRef(null)

  const connectWS = useCallback(() => {
    if (!shouldReconnectRef.current) return
    const current = wsRef.current
    if (current && (current.readyState === WebSocket.OPEN || current.readyState === WebSocket.CONNECTING)) {
      return
    }

    setIsConnected(false)
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws
    
    ws.onopen = () => {
      console.log('WS Connected')
      setIsConnected(true)
    }

    ws.onmessage = (msg) => {
      try {
        if (seenEventsRef.current.has(msg.data)) {
          return
        }
        seenEventsRef.current.add(msg.data)
        if (seenEventsRef.current.size > 5000) {
          seenEventsRef.current.clear()
        }

        const rawEvent = JSON.parse(msg.data)
        const event = {
          ...rawEvent,
          Type: rawEvent.Type ?? rawEvent.type,
          RunID: rawEvent.RunID ?? rawEvent.run_id,
          AgentID: rawEvent.AgentID ?? rawEvent.agent_id,
          Role: rawEvent.Role ?? rawEvent.role,
          Status: rawEvent.Status ?? rawEvent.status,
          Message: rawEvent.Message ?? rawEvent.message,
          ToolName: rawEvent.ToolName ?? rawEvent.tool_name,
          Timestamp: rawEvent.Timestamp ?? rawEvent.timestamp,
          Meta: rawEvent.Meta ?? rawEvent.meta,
        }
        
        setRuns(prev => {
          const newRuns = [...prev]
          
          if (event.Type === 'swarm_started') {
            const exists = newRuns.find(r => r.id === event.RunID)
            if (!exists) {
              newRuns.push({
                id: event.RunID,
                task: event.Message,
                status: 'running',
                events: [event]
              })
            }
          } else {
            const runIdx = newRuns.findIndex(r => r.id === event.RunID)
            if (runIdx >= 0) {
              const run = { ...newRuns[runIdx] }
              run.events = [...run.events, event]
              
              if (event.Type === 'swarm_finished') {
                run.status = event.Status === 'failed' ? 'failed' : 'completed'
              }
              
              newRuns[runIdx] = run
            }
          }
          return newRuns
        })
        
        // Track unique agents
        if (event.AgentID) {
          setActiveAgents(prev => {
            const exists = prev.find(a => a.id === event.AgentID)
            if (!exists) {
              return [...prev, { id: event.AgentID, role: event.Role || 'unknown' }]
            }
            return prev
          })
        }
        
      } catch(e) {
        console.error('Failed to parse WS message', e)
      }
    }

    ws.onclose = () => {
      console.log('WS Disconnected')
      if (wsRef.current === ws) {
        wsRef.current = null
      }
      setIsConnected(false)

      if (!shouldReconnectRef.current) {
        return
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
      }
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null
        connectWS()
      }, 3000)
    }

    ws.onerror = () => {
      setIsConnected(false)
    }
  }, [])

  useEffect(() => {
    shouldReconnectRef.current = true
    connectWS()

    return () => {
      shouldReconnectRef.current = false
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      const ws = wsRef.current
      wsRef.current = null
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close()
      }
    }
  }, [connectWS])

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [runs])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!input.trim()) return

    const task = input.trim()
    setInput('')
    
    // Optimistically add user message (we can use a dummy run to show it)
    setRuns(prev => [...prev, { id: `user-${Date.now()}`, type: 'user', content: task }])

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task })
      })
      const data = await res.json()
      // The backend will fire 'swarm_started' over WS soon
    } catch(err) {
      console.error('Failed to start task', err)
      setRuns(prev => [...prev, { id: `error-${Date.now()}`, type: 'error', content: 'Failed to connect to backend.' }])
    }
  }

  return (
    <div className="bg-[#0D0D0D] w-full h-[calc(100vh-1.5rem)] rounded-xl border-2 border-[#1A1A1A] relative flex flex-col font-['Geist_Pixel'] overflow-hidden">
      
      {/* Background Dither */}
      <div className="absolute top-0 left-0 w-full h-[40%] opacity-[0.15] pointer-events-none z-0"
           style={{ maskImage: 'linear-gradient(to bottom, black 0%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, black 0%, transparent 100%)' }}>
        <Dither
          waveColor={[1.0, 0.4, 0.7]}
          disableAnimation={false}
          colorNum={8.0}
          waveAmplitude={0.2}
          waveFrequency={2.0}
          waveSpeed={0.02}
        />
      </div>

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-[#ff5aa8] shadow-[0_0_8px_#ff5aa8]' : 'bg-zinc-500'}`} />
          {/* <h1 className="text-xl font-semibold text-white tracking-tight">Agent Swarm</h1>*/}
          <span className="text-xs text-zinc-500 border border-zinc-800 rounded-full px-2 py-0.5 bg-zinc-900/50">v1.0</span>
        </div>
        
        <div className="flex items-center gap-3">
          {runs.some(r => r.status === 'running') && (
            <div className="flex items-center gap-2 text-[#ff5aa8] text-xs font-medium mr-2">
              <div className="w-4 h-4 rounded-full border-2 border-[#ff5aa8]/30 border-t-[#ff5aa8] animate-spin shadow-[0_0_10px_rgba(255,90,168,0.35)]" />
              Processing...
            </div>
          )}
          <button 
            onClick={() => setShowAgents(!showAgents)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all border cursor-pointer ${showAgents ? 'bg-zinc-800 text-white border-zinc-700' : 'bg-transparent text-zinc-400 border-zinc-800 hover:bg-zinc-900 hover:text-white'}`}
          >
            <FaRobot className="w-3.5 h-3.5" />
            Agents ({activeAgents.length})
          </button>
        </div>
      </div>

      {/* Chat Area */}
      <div className="theme-scrollbar flex-1 overflow-y-auto relative z-10 p-4 sm:p-6 scroll-smooth">
        {runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center opacity-50 space-y-4">
            <FaRegMessage className="w-12 h-12 text-zinc-600 mb-2" />
            <h2 className="text-xl font-medium text-zinc-300">Your swarm is ready.</h2>
            <p className="text-sm text-zinc-500 max-w-md">
              Ask the swarm to perform tasks, audit code, or fetch information. They will orchestrate and delegate as needed.
            </p>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto flex flex-col">
            {runs.map((r, i) => {
              if (r.type === 'user') {
                  return <UserMessage key={r.id} content={r.content} />
                }
                if (r.type === 'error') {
                  return (
                    <div key={r.id} className="w-full text-center text-red-400 text-xs py-2 bg-red-950/20 border border-red-900/30 rounded-lg mb-4">
                      {r.content}
                    </div>
                  )
                }
                return <AgentRunMessage key={r.id} run={r} />
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="relative z-10 p-4 sm:p-6 border-t border-[#1A1A1A] bg-[#0D0D0D]/90 backdrop-blur-md">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto relative group">
          <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-[#ff5aa8]/20 via-[#a742ff]/20 to-transparent opacity-0 blur transition duration-500 group-hover:opacity-100" />
          <div className="relative flex items-center bg-zinc-900 rounded-2xl border border-zinc-700/50 shadow-inner focus-within:border-[#ff5aa8]/50 focus-within:ring-1 focus-within:ring-[#ff5aa8]/50 transition-all overflow-hidden">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit(e)
                }
              }}
              placeholder="Ask the swarm to perform a task..."
              className="theme-scrollbar w-full bg-transparent text-white px-4 py-4 text-sm resize-none focus:outline-none placeholder:text-zinc-600 font-['Geist_Pixel'] min-h-[56px] max-h-48"
              rows={1}
              style={{ fieldSizing: 'content' }}
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="p-3 mx-1.5 text-zinc-400 hover:text-white bg-zinc-800/50 hover:bg-[#ff5aa8] rounded-xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-zinc-800/50 flex-shrink-0"
            >
              <FaPaperPlane className="w-4 h-4" />
            </button>
          </div>
          <div className="text-center mt-2 text-[10px] text-zinc-600">
            Press <kbd className="bg-zinc-800 px-1 py-0.5 rounded border border-zinc-700 font-sans mx-1">Enter</kbd> to send, <kbd className="bg-zinc-800 px-1 py-0.5 rounded border border-zinc-700 font-sans mx-1">Shift+Enter</kbd> for new line
          </div>
        </form>
      </div>

      <AgentsSidebar agents={activeAgents} isOpen={showAgents} onClose={() => setShowAgents(false)} />
    </div>
  )
}
