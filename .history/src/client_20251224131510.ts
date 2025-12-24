import type {
  ClientOptions,
  Workspace,
  WorkspaceCreate,
  WorkspaceRename,
  DatasetItem,
  UploadResponse,
  UserCreateResponse,
  UploadFileInput,
  UploadDatasetOptions,
  DatasetMetaResponse,
  DatasetSchemaResponse,
  DatasetColumnCreate,
  DatasetColumnUpdate,
  StoredDatasetColumn,
  RowSet,
  RowSetCreate,
  RowSetUpdate,
  RowSetSampleResponse,
  ColumnSet,
  ColumnSetCreate,
  ColumnSetUpdate,
  TrainingParamSet,
  TrainingParamSetCreate,
  TrainingParamSetUpdate,
  ModelDetail,
  TrainingRequest,
  TrainingResponse,
  OptimalParamSearchRequest,
  OptimalParamSearchResponse,
  PredictionRequest,
  PredictionResponse,
  PredictionWithFreeParameterRequest,
  PredictionWithFreeParameterResponse,
  ErrorResponse,
} from './types.js'
import { GagaraBoostError } from './types.js'

export class GagaraBoostClient {
  readonly #baseUrl: string
  readonly #fetch: typeof globalThis.fetch
  readonly #timeout: number
  #token?: string

  constructor(options: ClientOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/$/, '')
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis)
    this.#timeout = options.timeout ?? 30_000
    this.#token = options.token
  }

  get token (): string | undefined {
    return this.#token
  }

  setToken (token?: string): void {
    this.#token = token
  }

  // ----------------------------------------------------------
  // Health
  // ----------------------------------------------------------

  async health (): Promise<boolean> {
    try {
      const res = await this.#request('/health')
      return res.ok
    } catch {
      return false
    }
  }

  // ----------------------------------------------------------
  // Workspaces
  // ----------------------------------------------------------

  async listWorkspaces (): Promise<Workspace[]> {
    return this.#requestJson('/workspaces')
  }

  async createWorkspace (data: WorkspaceCreate | string): Promise<Workspace> {
    const payload = typeof data === 'string' ? { name: data } : data
    return this.#requestJson('/workspaces', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async getWorkspace (id: string): Promise<Workspace> {
    return this.#requestJson(`/workspaces/${id}`)
  }

  async renameWorkspace (id: string, name: string): Promise<Workspace> {
    const payload: WorkspaceRename = { name }
    return this.#requestJson(`/workspaces/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  }

  async deleteWorkspace (id: string): Promise<{ status: string }> {
    return this.#requestJson(`/workspaces/${id}`, { method: 'DELETE' })
  }

  // ----------------------------------------------------------
  // Datasets
  // ----------------------------------------------------------

  async listDatasets (workspaceId?: string): Promise<DatasetItem[]> {
    return this.#requestJson('/datasets', undefined, {
      workspace_id: workspaceId,
    })
  }

  async getDataset (id: string): Promise<DatasetItem> {
    return this.#requestJson(`/datasets/${id}`)
  }

  async uploadDataset (
    file: UploadFileInput,
    options: UploadDatasetOptions = {}
  ): Promise<UploadResponse> {
    const form = new FormData()
    const filename = options.filename ?? 'dataset.parquet'
    const contentType = options.contentType ?? 'application/octet-stream'

    let payload: Blob | File
    if (file instanceof Blob) {
      payload = file
    } else {
      payload = new Blob([file], { type: contentType })
    }

    if (payload instanceof File) {
      form.append('file', payload)
    } else {
      form.append('file', payload, filename)
    }

    if (options.workspaceId) {
      form.append('workspace_id', options.workspaceId)
    }
    if (options.alias) {
      form.append('alias', options.alias)
    }

    return this.#requestJson('/datasets', { method: 'POST', body: form })
  }

  async downloadDataset (id: string): Promise<ArrayBuffer> {
    const res = await this.#request(`/datasets/${id}/download`)
    if (!res.ok) {
      const errorBody = await this.#parseError(res)
      throw new GagaraBoostError(
        this.#errorMessage(res.status, errorBody),
        res.status,
        errorBody
      )
    }
    return res.arrayBuffer()
  }

  async deleteDataset (id: string): Promise<{ status: string }> {
    return this.#requestJson(`/datasets/${id}`, { method: 'DELETE' })
  }

  async updateDatasetAlias (id: string, alias: string): Promise<DatasetItem> {
    return this.#requestJson(`/datasets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ alias }),
    })
  }

  async getDatasetMeta (id: string): Promise<DatasetMetaResponse> {
    return this.#requestJson(`/datasets/${id}/meta`)
  }

  async refreshDatasetMeta (id: string): Promise<DatasetMetaResponse> {
    return this.#requestJson(`/datasets/${id}/refresh`, { method: 'POST' })
  }

  async getDatasetSchema (id: string): Promise<DatasetSchemaResponse> {
    return this.#requestJson(`/datasets/${id}/schema`)
  }

  async listDatasetColumns (datasetId: string): Promise<StoredDatasetColumn[]> {
    return this.#requestJson(`/datasets/${datasetId}/columns`)
  }

  async createDatasetColumn (
    datasetId: string,
    payload: DatasetColumnCreate
  ): Promise<StoredDatasetColumn> {
    return this.#requestJson(`/datasets/${datasetId}/columns`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async updateDatasetColumn (
    datasetId: string,
    columnId: string,
    payload: DatasetColumnUpdate
  ): Promise<StoredDatasetColumn> {
    return this.#requestJson(`/datasets/${datasetId}/columns/${columnId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  }

  // ----------------------------------------------------------
  // Row Sets
  // ----------------------------------------------------------

  async listRowSets (workspaceId?: string): Promise<RowSet[]> {
    return this.#requestJson('/row-sets', undefined, {
      workspace_id: workspaceId,
    })
  }

  async getRowSet (id: string): Promise<RowSet> {
    return this.#requestJson(`/row-sets/${id}`)
  }

  async createRowSet (payload: RowSetCreate): Promise<RowSet> {
    return this.#requestJson('/row-sets', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async updateRowSet (id: string, payload: RowSetUpdate): Promise<RowSet> {
    return this.#requestJson(`/row-sets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  }

  async deleteRowSet (id: string): Promise<{ status: string }> {
    return this.#requestJson(`/row-sets/${id}`, { method: 'DELETE' })
  }

  async getRowSetSchema (id: string): Promise<DatasetSchemaResponse> {
    return this.#requestJson(`/row-sets/${id}/schema`)
  }

  async getRowSetMeta (
    id: string,
    options?: { force?: boolean }
  ): Promise<DatasetMetaResponse> {
    return this.#requestJson(`/row-sets/${id}/meta`, undefined, {
      force: options?.force ? 'true' : undefined,
    })
  }

  async getRowSetSample (id: string): Promise<RowSetSampleResponse> {
    return this.#requestJson(`/row-sets/${id}/sample`)
  }

  // ----------------------------------------------------------
  // Column Sets
  // ----------------------------------------------------------

  async listColumnSets (params?: {
    workspaceId?: string
    datasetId?: string
  }): Promise<ColumnSet[]> {
    return this.#requestJson('/column-sets', undefined, {
      workspace_id: params?.workspaceId,
      dataset_id: params?.datasetId,
    })
  }

  async getColumnSet (id: string): Promise<ColumnSet> {
    return this.#requestJson(`/column-sets/${id}`)
  }

  async createColumnSet (payload: ColumnSetCreate): Promise<ColumnSet> {
    return this.#requestJson('/column-sets', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async cloneColumnSet (id: string): Promise<ColumnSet> {
    return this.#requestJson(`/column-sets/${id}/clone`, { method: 'POST' })
  }

  async updateColumnSet (id: string, payload: ColumnSetUpdate): Promise<ColumnSet> {
    return this.#requestJson(`/column-sets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  }

  async deleteColumnSet (id: string): Promise<{ status: string }> {
    return this.#requestJson(`/column-sets/${id}`, { method: 'DELETE' })
  }

  // ----------------------------------------------------------
  // Training Param Sets
  // ----------------------------------------------------------

  async listTrainingParamSets (workspaceId?: string): Promise<TrainingParamSet[]> {
    return this.#requestJson('/training-param-sets', undefined, {
      workspace_id: workspaceId,
    })
  }

  async getTrainingParamSet (id: string): Promise<TrainingParamSet> {
    return this.#requestJson(`/training-param-sets/${id}`)
  }

  async createTrainingParamSet (
    payload: TrainingParamSetCreate
  ): Promise<TrainingParamSet> {
    return this.#requestJson('/training-param-sets', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async updateTrainingParamSet (
    id: string,
    payload: TrainingParamSetUpdate
  ): Promise<TrainingParamSet> {
    return this.#requestJson(`/training-param-sets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  }

  async deleteTrainingParamSet (id: string): Promise<{ status: string }> {
    return this.#requestJson(`/training-param-sets/${id}`, {
      method: 'DELETE',
    })
  }

  // ----------------------------------------------------------
  // Models
  // ----------------------------------------------------------

  async listModels (params?: {
    workspaceId?: string
    datasetId?: string
  }): Promise<ModelDetail[]> {
    return this.#requestJson('/models', undefined, {
      workspace_id: params?.workspaceId,
      dataset_id: params?.datasetId,
    })
  }

  async getModel (id: string): Promise<ModelDetail> {
    return this.#requestJson(`/models/${id}`)
  }

  async deleteModel (id: string): Promise<{ status: string }> {
    return this.#requestJson(`/models/${id}`, { method: 'DELETE' })
  }

  async renameModel (id: string, name: string): Promise<ModelDetail> {
    return this.#requestJson(`/models/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    })
  }

  // ----------------------------------------------------------
  // Actions
  // ----------------------------------------------------------

  async train (request: TrainingRequest): Promise<TrainingResponse> {
    return this.#requestJson('/train', {
      method: 'POST',
      body: JSON.stringify(request),
    })
  }

  async calculateOptimalParamSet (
    request: OptimalParamSearchRequest
  ): Promise<OptimalParamSearchResponse> {
    return this.#requestJson('/calculate-optimal-param-set', {
      method: 'POST',
      body: JSON.stringify(request),
    })
  }

  async predict (
    modelId: string,
    request: PredictionRequest
  ): Promise<PredictionResponse> {
    return this.#requestJson('/predict/', {
      method: 'POST',
      body: JSON.stringify(request),
    }, {
      id: modelId,
    })
  }

  async predictWithFreeParameter (
    modelId: string,
    request: PredictionWithFreeParameterRequest
  ): Promise<PredictionWithFreeParameterResponse> {
    return this.#requestJson('/predict-with-free-parameter/', {
      method: 'POST',
      body: JSON.stringify(request),
    }, {
      id: modelId,
    })
  }

  // ----------------------------------------------------------
  // Internal
  // ----------------------------------------------------------

  async #request (
    path: string,
    init?: RequestInit,
    params?: Record<string, string | number | boolean | undefined>
  ): Promise<Response> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.#timeout)

    try {
      const headers = new Headers(init?.headers ?? {})
      if (this.#token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${this.#token}`)
      }

      const url = this.#buildUrl(path, params)
      return await this.#fetch(url, {
        ...init,
        headers,
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }
  }

  async #requestJson<T> (
    path: string,
    init?: RequestInit,
    params?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    const headers = new Headers(init?.headers ?? {})
    if (
      init?.body !== undefined &&
      !(init.body instanceof FormData) &&
      !headers.has('Content-Type')
    ) {
      headers.set('Content-Type', 'application/json')
    }

    const res = await this.#request(
      path,
      {
        ...init,
        headers,
      },
      params
    )

    if (!res.ok) {
      const errorBody = await this.#parseError(res)
      throw new GagaraBoostError(
        this.#errorMessage(res.status, errorBody),
        res.status,
        errorBody
      )
    }

    return this.#parseJson(res) as Promise<T>
  }

  #buildUrl (
    path: string,
    params?: Record<string, string | number | boolean | undefined>
  ): string {
    const url = new URL(`${this.#baseUrl}${path}`)
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value))
        }
      }
    }
    return url.toString()
  }

  async #parseJson (res: Response): Promise<unknown> {
    const text = await res.text()
    if (!text) {
      return undefined
    }
    try {
      return JSON.parse(text)
    } catch {
      throw new GagaraBoostError('Failed to parse JSON response', res.status)
    }
  }

  async #parseError (res: Response): Promise<ErrorResponse | undefined> {
    const text = await res.text()
    if (!text) {
      return undefined
    }
    try {
      return JSON.parse(text)
    } catch {
      return { detail: text }
    }
  }

  #errorMessage (status: number, body?: ErrorResponse): string {
    if (!body) {
      return `Request failed: ${status}`
    }
    if (typeof body.detail === 'string') {
      return body.detail
    }
    if (typeof body.error === 'string') {
      return body.error
    }
    return `Request failed: ${status}`
  }
}
