import { fetchBackboard } from './client.js'

export const modelsApi = {
  list: () => fetchBackboard('/models'),
  listProviders: () => fetchBackboard('/models/providers'),
  listEmbeddingModels: () => fetchBackboard('/models/embedding'),
  listEmbeddingProviders: () => fetchBackboard('/embedding-providers'),
}
