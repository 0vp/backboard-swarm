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

function Memory() {
  const [activeTab, setActiveTab] = useState('assistants')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Memory Console</h1>
        <p className="text-zinc-400 mt-2">Inspect Backboard assistants, chats, histories, documents, memories, and models.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded px-3 py-2 text-sm border transition-colors ${
              activeTab === tab.id
                ? 'purple-gradient-button border-transparent'
                : 'black-gradient-button border-zinc-700 text-zinc-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'assistants' && <AssistantsSection />}
      {activeTab === 'threads' && <ThreadsSection />}
      {activeTab === 'documents' && <DocumentsSection />}
      {activeTab === 'models' && <ModelsSection />}
    </div>
  )
}

export default Memory
