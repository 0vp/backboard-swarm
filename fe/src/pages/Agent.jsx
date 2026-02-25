import { useState } from 'react'

import AssistantsSection from '../components/memory/AssistantsSection'
import ThreadsSection from '../components/memory/ThreadsSection'
import DocumentsSection from '../components/memory/DocumentsSection'
import ModelsSection from '../components/memory/ModelsSection'

const tabs = [
  { id: 'assistants', label: 'Assistants' },
  { id: 'threads', label: 'Threads' },
  { id: 'documents', label: 'Documents' },
  { id: 'models', label: 'Models' },
]

function Agent() {
  const [activeTab, setActiveTab] = useState('assistants')

  return (
    <div className="bg-[#0D0D0D] w-full h-[calc(100vh-1.5rem)] rounded-xl border-2 border-[#1A1A1A] relative overflow-y-auto flex flex-col font-['Geist_Pixel'] p-8 sm:p-12">
      
      {/* Header Section */}
      <div className="mb-8 animate-diagonal-fade-in" style={{ animationDelay: '0ms' }}>
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-white mb-4">
          Agent Console
        </h1>
        <p className="text-zinc-500 text-sm leading-relaxed max-w-2xl">
          Inspect Backboard assistants, chats, histories, documents, memories, and models.
        </p>
      </div>

      {/* Tabs Section */}
      <div className="flex flex-wrap items-center gap-4 mb-8 border-b-[3px] border-dashed border-[#1A1A1A] pb-8 animate-diagonal-fade-in" style={{ animationDelay: '150ms' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-2 text-sm rounded-full font-medium transition-all cursor-pointer ${
              activeTab === tab.id
                ? 'purple-gradient-button'
                : 'black-gradient-button border border-zinc-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content Section */}
      <div className="flex-1 text-white animate-diagonal-fade-in" style={{ animationDelay: '300ms' }}>
        {activeTab === 'assistants' && <AssistantsSection />}
        {activeTab === 'threads' && <ThreadsSection />}
        {activeTab === 'documents' && <DocumentsSection />}
        {activeTab === 'models' && <ModelsSection />}
      </div>
    </div>
  )
}

export default Agent
