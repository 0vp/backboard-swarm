import { useCallback, useEffect, useMemo, useState } from 'react'

import { modelsApi } from '../../lib/backboard/index.js'

function toArray(payload, key) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.[key])) return payload[key]
  if (Array.isArray(payload?.items)) return payload.items
  return []
}

function normalizeProvider(provider) {
  if (typeof provider === 'string') {
    return { id: provider, name: provider }
  }
  return {
    ...provider,
    id: provider.id || provider.provider || provider.name,
    name: provider.name || provider.id || provider.provider,
  }
}

function normalizeModel(model) {
  const provider = model.provider || model.model_provider
  const name = model.name || model.model_name || model.id

  return {
    ...model,
    provider,
    name,
    id: model.id || (provider && name ? `${provider}/${name}` : name),
  }
}

function ModelsSection() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [providers, setProviders] = useState([])
  const [models, setModels] = useState([])
  const [embeddingProviders, setEmbeddingProviders] = useState([])
  const [embeddingModels, setEmbeddingModels] = useState([])
  const [modelSearch, setModelSearch] = useState('')
  const [providerFilter, setProviderFilter] = useState('all')
  const [embeddingSearch, setEmbeddingSearch] = useState('')
  const [embeddingProviderFilter, setEmbeddingProviderFilter] = useState('all')

  const loadModels = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [modelsPayload, providersPayload, embeddingPayload, embeddingProvidersPayload] = await Promise.all([
        modelsApi.list(),
        modelsApi.listProviders(),
        modelsApi.listEmbeddingModels(),
        modelsApi.listEmbeddingProviders(),
      ])

      const allModels = toArray(modelsPayload, 'models').map(normalizeModel)
      const allProviders = toArray(providersPayload, 'providers').map(normalizeProvider).filter((provider) => Boolean(provider.id))
      const allEmbeddingModels = toArray(embeddingPayload, 'models').map(normalizeModel)
      const allEmbeddingProviders = toArray(embeddingProvidersPayload, 'providers').map(normalizeProvider).filter((provider) => Boolean(provider.id))

      setModels(allModels.filter((model) => model.model_type !== 'embedding'))
      setProviders(allProviders)
      setEmbeddingModels(allEmbeddingModels)
      setEmbeddingProviders(allEmbeddingProviders)
    } catch (loadError) {
      setError(loadError.message || 'Failed to load models')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadModels()
  }, [loadModels])

  const filteredModels = useMemo(() => {
    const search = modelSearch.trim().toLowerCase()
    return models.filter((model) => {
      const name = `${model.provider || ''}/${model.name || ''}`.toLowerCase()
      if (providerFilter !== 'all' && model.provider !== providerFilter) return false
      if (search && !name.includes(search)) return false
      return true
    })
  }, [models, modelSearch, providerFilter])

  const filteredEmbeddingModels = useMemo(() => {
    const search = embeddingSearch.trim().toLowerCase()
    return embeddingModels.filter((model) => {
      const name = `${model.provider || ''}/${model.name || ''}`.toLowerCase()
      if (embeddingProviderFilter !== 'all' && model.provider !== embeddingProviderFilter) return false
      if (search && !name.includes(search)) return false
      return true
    })
  }, [embeddingModels, embeddingSearch, embeddingProviderFilter])

  if (loading) {
    return <p className="text-zinc-400">Loading models...</p>
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-white">Models</h2>
        <p className="text-sm text-zinc-400 mt-1">Browse available chat and embedding models from Backboard.</p>
      </div>

      {error && (
        <div className="rounded border border-red-600/50 bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded border border-zinc-800 bg-zinc-950 p-4 space-y-3">
          <h3 className="text-sm font-medium text-zinc-100">Language models ({filteredModels.length})</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <input
              value={modelSearch}
              onChange={(event) => setModelSearch(event.target.value)}
              placeholder="Search models"
              className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
            />
            <select
              value={providerFilter}
              onChange={(event) => setProviderFilter(event.target.value)}
              className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
            >
              <option value="all">All providers</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>{provider.name}</option>
              ))}
            </select>
          </div>

          <div className="max-h-[28rem] overflow-auto space-y-2">
            {filteredModels.map((model) => (
              <div key={model.id} className="rounded border border-zinc-800 bg-zinc-900 px-3 py-2">
                <p className="text-sm text-zinc-100">{model.name || model.id}</p>
                <p className="text-xs text-zinc-400 mt-1">{model.provider || 'unknown provider'}</p>
                <p className="text-xs text-zinc-500 mt-1">
                  Context: {model.context_limit ?? 'n/a'} · Tools: {model.supports_tools ? 'yes' : 'no'}
                </p>
              </div>
            ))}
            {filteredModels.length === 0 && (
              <p className="text-xs text-zinc-500">No language models found.</p>
            )}
          </div>
        </div>

        <div className="rounded border border-zinc-800 bg-zinc-950 p-4 space-y-3">
          <h3 className="text-sm font-medium text-zinc-100">Embedding models ({filteredEmbeddingModels.length})</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <input
              value={embeddingSearch}
              onChange={(event) => setEmbeddingSearch(event.target.value)}
              placeholder="Search embedding models"
              className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
            />
            <select
              value={embeddingProviderFilter}
              onChange={(event) => setEmbeddingProviderFilter(event.target.value)}
              className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
            >
              <option value="all">All providers</option>
              {embeddingProviders.map((provider) => (
                <option key={provider.id} value={provider.id}>{provider.name}</option>
              ))}
            </select>
          </div>

          <div className="max-h-[28rem] overflow-auto space-y-2">
            {filteredEmbeddingModels.map((model) => (
              <div key={model.id} className="rounded border border-zinc-800 bg-zinc-900 px-3 py-2">
                <p className="text-sm text-zinc-100">{model.name || model.id}</p>
                <p className="text-xs text-zinc-400 mt-1">{model.provider || 'unknown provider'}</p>
                <p className="text-xs text-zinc-500 mt-1">
                  Dimensions: {model.embedding_dimensions ?? model.dimensions ?? 'n/a'}
                </p>
              </div>
            ))}
            {filteredEmbeddingModels.length === 0 && (
              <p className="text-xs text-zinc-500">No embedding models found.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

export default ModelsSection
