import { useNavigate } from 'react-router'
import Dither from "../components/art/Dither";


function Index() {
  const navigate = useNavigate()

  return (
    <div className="bg-[#0D0D0D] w-full h-[calc(100vh-1.5rem)] rounded-xl border-2 border-[#1A1A1A] relative overflow-hidden flex flex-col items-center">
      {/* Dither Animation Background */}
      <div className="absolute top-0 left-0 w-full h-[65%] opacity-40 pointer-events-auto animate-diagonal-fade-in"
           style={{ 
             maskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)', 
             WebkitMaskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
             animationDelay: '0ms'
           }}>
        <Dither
          waveColor={[0.5, 0.5, 0.5]}
          disableAnimation={false}
          enableMouseInteraction
          mouseRadius={0.1}
          colorNum={6.8}
          waveAmplitude={0.32}
          waveFrequency={3.2}
          waveSpeed={0.03}
        />
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex flex-col items-center pt-32 sm:pt-40 w-full px-4 pointer-events-none font-['Geist_Pixel']">
        <h1 className="text-5xl sm:text-7xl font-semibold tracking-tight text-white mb-8 animate-diagonal-fade-in" style={{ animationDelay: '150ms' }}>
          wuvo workers
        </h1>
        
        <div className="flex items-center gap-4 pointer-events-auto animate-diagonal-fade-in" style={{ animationDelay: '300ms' }}>
          <button 
            className="purple-gradient-button px-5 py-2 text-sm rounded-full font-medium transition-all cursor-pointer"
            onClick={() => navigate('/agent')}>
            Get Started
          </button>
          <button 
            className="black-gradient-button text-white hover:text-white px-5 py-2 text-sm rounded-full font-medium transition-colors border border-zinc-700 cursor-pointer"
          >
            See Benchmarks
          </button>
        </div>
      </div>

      {/* Dotted Line at bottom third */}
      <div className="absolute bottom-0 w-full p-4 pb-8 font-['Geist_Pixel'] animate-diagonal-fade-in" style={{ animationDelay: '450ms' }}>
        <div className="w-full border-t-[3px] border-dashed border-[#4D4D4D] opacity-80 mb-4"/>
        <div className="flex justify-between items-start w-full pl-4">
          <div className="max-w-4xl">
            <h2 className="text-white text-3xl leading-relaxed">Unlock Fully Intertwined Hive-Minded AI Agents to Simultaneously Swarm Better than Ever.</h2>
          </div>
          
          {/* Dotted Grid Box on the right  */}
          <div 
            className="w-[400px] h-40 border-[#4D4D4D] opacity-80 shrink-0 mt-4"
            style={{
              backgroundImage: 'radial-gradient(#4D4D4D 1px, transparent 1px)',
              backgroundSize: '8px 8px'
            }}
          >
          </div>
        </div>
        <div className="flex flex-row gap-12 w-full max-w-7xl pl-4 mt-4 pr-4">
          <p className="text-zinc-500 text-xs flex-1 leading-relaxed">
            Wuvo is an intelligent agent orchestration system built on Backboard. It deploys multiple AI agents in parallel goroutines, each with specialized roles like Researcher, Fact Checker, or Developer. An Orchestrator agent dynamically decomposes complex tasks and delegates to subagents for simultaneous execution.
          </p>
          <p className="text-zinc-500 text-xs flex-1 leading-relaxed">
            Each agent operates in its own goroutine with access to a powerful tool suite: file reading, code search, web search, and web fetching. Agents communicate through WebSockets, streaming real-time progress updates, tool calls, and results back to the frontend for live monitoring.
          </p>
          <p className="text-zinc-500 text-xs flex-1 leading-relaxed">
            The system leverages Backboard's SOTA memory architecture, enabling assistants to remember facts and preferences across conversations. Persistent threads maintain context, while shared memory allows agents to access common knowledge and previous interactions for more coherent responses.
          </p>
          <p className="text-zinc-500 text-xs flex-1 leading-relaxed">
            By running independent subtasks in parallel rather than sequentially, Wuvo achieves significant latency speedups compared to single-agent systems. The Orchestrator synthesizes results from all subagents into a unified final answer, making complex multi-step workflows dramatically faster.
          </p>
        </div>
      </div>
    </div>
  )
}

export default Index
