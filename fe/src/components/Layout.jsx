import { useState, useEffect } from 'react'
import { Link, Outlet } from 'react-router'
import { useApiKey } from '../hooks/useApiKey.js'

function Layout() {
  const { apiKey, setApiKey, hasApiKey } = useApiKey()
  const [inputKey, setInputKey] = useState(apiKey)

  useEffect(() => {
    setInputKey(apiKey)
  }, [apiKey])

  const handleSaveKey = () => {
    setApiKey(inputKey.trim())
  }

  return (
    <div className="min-h-screen bg-black">
      <nav className="relative z-10 bg-zinc-900 border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center space-x-8">
              <Link to="/" className="text-xl font-bold text-white">
                Backboard
              </Link>
              <div className="hidden md:flex items-center space-x-4">
                <Link
                  to="/"
                  className="text-zinc-400 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  Home
                </Link>
                <Link
                  to="/memory"
                  className="text-zinc-400 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  Memory
                </Link>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="password"
                value={inputKey}
                onChange={(e) => setInputKey(e.target.value)}
                placeholder="Enter API Key"
                className="rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-white w-48"
              />
              <button
                onClick={handleSaveKey}
                className="rounded bg-zinc-200 px-3 py-1.5 text-sm font-medium text-black hover:bg-white"
              >
                Save
              </button>
              {hasApiKey && (
                <span className="text-xs text-green-400">●</span>
              )}
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  )
}

export default Layout
