import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Send,
  Terminal,
  FileText,
  FolderOpen,
  Code,
  Activity,
  Play,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Bot,
  Globe,
  Settings,
  X,
  Search,
  MessageSquare
} from 'lucide-react'
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

const MarkdownMessage = ({ content, className = '' }) => (
  <div className={`whitespace-normal break-words [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:border [&_pre]:border-zinc-700 [&_pre]:bg-zinc-950/70 [&_pre]:p-2 [&_code]:rounded [&_code]:bg-zinc-900 [&_code]:px-1 [&_code]:py-0.5 [&_blockquote]:border-l-2 [&_blockquote]:border-[#ff5aa8] [&_blockquote]:pl-3 ${className}`}>
    <ReactMarkdown remarkPlugins={[remarkGfm]}>
      {stringifyContent(content)}
    </ReactMarkdown>
  </div>
)

const getToolIcon = (toolName) => {
  if (!toolName) return <Activity className="w-4 h-4" />
  const lower = toolName.toLowerCase()
  if (lower.includes('read') || lower.includes('view')) return <FileText className="w-4 h-4 text-[#ff5aa8]" />
  if (lower.includes('list') || lower.includes('ls')) return <FolderOpen className="w-4 h-4 text-[#ff5aa8]" />
  if (lower.includes('patch') || lower.includes('write')) return <Code className="w-4 h-4 text-[#ff5aa8]" />
  if (lower.includes('exec') || lower.includes('run')) return <Terminal className="w-4 h-4 text-[#ff5aa8]" />
  if (lower.includes('search')) return <Search className="w-4 h-4 text-[#ff5aa8]" />
  if (lower.includes('web')) return <Globe className="w-4 h-4 text-[#ff5aa8]" />
  return <Activity className="w-4 h-4 text-[#ff5aa8]" />
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
      return `${label} (${args.slice(0, 30)}${args.length > 30 ? '...' : ''})`
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
        <div className="flex items-center justify-center w-4 h-4">
          {expanded ? <ChevronDown className="w-3 h-3 text-zinc-500 group-hover:text-zinc-300" /> : <ChevronRight className="w-3 h-3 text-zinc-500 group-hover:text-zinc-300" />}
        </div>
        {getToolIcon(event.ToolName)}
        <span className="text-sm font-medium">{getToolLabel(event.ToolName, event.Message)}</span>
        <span className="ml-2 rounded-full border border-[#ff5aa8]/40 bg-[#ff5aa8]/10 px-2 py-0.5 text-[10px] font-medium text-[#ff8ec8]">
          {agentLabel}
        </span>
        
        {isFinished ? (
          isError ? <XCircle className="w-3 h-3 text-red-500 ml-2" /> : <CheckCircle2 className="w-3 h-3 text-green-500 ml-2" />
        ) : (
          <span className="w-2 h-2 rounded-full bg-[#ff5aa8] animate-pulse ml-2 shadow-[0_0_8px_rgba(255,90,168,0.7)]" />
        )}
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
              <div className="bg-zinc-900 p-2 rounded mt-1 border border-zinc-800 overflow-x-auto max-h-40 overflow-y-auto">
                <MarkdownMessage content={resultEvent.Message} className="text-zinc-200" />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const AgentRunMessage = ({ run }) => {
  const [expanded, setExpanded] = useState(true)
  
  const isFinished = run.status === 'completed' || run.status === 'failed'
  const isError = run.status === 'failed'

  const toolCalls = run.events.filter(e => e.Type === 'tool_call')
  const toolResults = run.events.filter(e => e.Type === 'tool_result')
  const summaryEvent = run.events.find(e => e.Type === 'swarm_finished')

  return (
    <div className="w-full bg-[#111111]/80 backdrop-blur-md border border-zinc-800/80 rounded-xl p-4 mb-4 transition-all hover:border-zinc-700/80">
      <div className="flex items-start justify-between">
        <div 
          className="flex items-start gap-3 cursor-pointer group flex-1"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="mt-1">
            {isFinished ? (
              isError ? <XCircle className="w-5 h-5 text-red-500" /> : <CheckCircle2 className="w-5 h-5 text-green-500" />
            ) : (
              <div className="w-3 h-3 mt-1 rounded-full bg-[#ff5aa8] animate-pulse shadow-[0_0_8px_rgba(255,90,168,0.7)]" />
            )}
          </div>
          
          <div className="flex-1">
            <h3 className="text-zinc-200 text-sm font-medium leading-relaxed mb-1 pr-4">
              {run.task}
            </h3>
          </div>
          
          <div className="flex items-center text-zinc-500">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 flex flex-col gap-1 border-t border-zinc-800/50 pt-4">
          {toolCalls.map((tc, i) => (
            <ToolCallNode key={`${tc.RunID}-${tc.Timestamp}-${i}`} event={tc} results={toolResults} />
          ))}
          
          {!isFinished && toolCalls.length === 0 && (
            <div className="ml-6 flex items-center gap-2 text-zinc-500 text-sm">
              <Activity className="w-4 h-4 animate-spin-slow" />
              Thinking...
            </div>
          )}

          {summaryEvent && (
            <div className="mt-4 bg-[#1A1A1A] rounded-lg p-4 text-sm text-zinc-300 border border-zinc-800">
              <div className="flex items-center gap-2 mb-2 text-[#ff5aa8] font-medium">
                <Bot className="w-4 h-4" /> Final Summary
              </div>
              <MarkdownMessage content={summaryEvent.Message} className="text-zinc-300" />
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

const AgentsSidebar = ({ agents, isOpen, onClose }) => {
  if (!isOpen) return null;
  
  return (
    <div className="absolute right-0 top-0 bottom-0 w-64 bg-[#0D0D0D] border-l-2 border-[#1A1A1A] z-20 flex flex-col animate-fade-in shadow-2xl">
      <div className="flex items-center justify-between p-4 border-b border-[#1A1A1A]">
        <h3 className="text-white font-medium flex items-center gap-2">
          <Bot className="w-4 h-4 text-[#ff5aa8]" /> Active Agents
        </h3>
        <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
  const [isConnecting, setIsConnecting] = useState(true)
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

    setIsConnecting(true)
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws
    
    ws.onopen = () => {
      console.log('WS Connected')
      setIsConnecting(false)
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
      setIsConnecting(false)

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
      <div className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-[#1A1A1A] bg-[#0D0D0D]/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${isConnecting ? 'bg-zinc-500' : 'bg-[#ff5aa8] shadow-[0_0_8px_#ff5aa8]'}`} />
          <h1 className="text-xl font-semibold text-white tracking-tight">Agent Swarm</h1>
          <span className="text-xs text-zinc-500 border border-zinc-800 rounded-full px-2 py-0.5 bg-zinc-900/50">v1.0</span>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowAgents(!showAgents)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all border cursor-pointer ${showAgents ? 'bg-zinc-800 text-white border-zinc-700' : 'bg-transparent text-zinc-400 border-zinc-800 hover:bg-zinc-900 hover:text-white'}`}
          >
            <Bot className="w-3.5 h-3.5" />
            Agents ({activeAgents.length})
          </button>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto relative z-10 p-4 sm:p-6 scroll-smooth">
        {runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center opacity-50 space-y-4">
            <MessageSquare className="w-12 h-12 text-zinc-600 mb-2" />
            <h2 className="text-xl font-medium text-zinc-300">Ready for commands</h2>
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
          <div className="relative flex items-end bg-zinc-900 rounded-2xl border border-zinc-700/50 shadow-inner focus-within:border-[#ff5aa8]/50 focus-within:ring-1 focus-within:ring-[#ff5aa8]/50 transition-all overflow-hidden">
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
              className="w-full bg-transparent text-white px-4 py-4 text-sm resize-none focus:outline-none placeholder:text-zinc-600 font-['Geist_Pixel'] min-h-[56px] max-h-48"
              rows={1}
              style={{ fieldSizing: 'content' }}
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="p-3 m-1.5 text-zinc-400 hover:text-white bg-zinc-800/50 hover:bg-[#ff5aa8] rounded-xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-zinc-800/50 flex-shrink-0"
            >
              <Send className="w-4 h-4" />
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
