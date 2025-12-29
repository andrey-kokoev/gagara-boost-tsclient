// ------------------------------------------------------------
// API Types (match gagara-boost server responses)
// ------------------------------------------------------------

export interface Workspace {
  id: string
  owner_user_id: string
  name: string
  is_default: boolean
  created_at: string
}

export interface WorkspaceCreate {
  name: string
}

export interface WorkspaceRename {
  name: string
}

export interface DatasetItem {
  id: string
  alias: string | null
  workspace_id: string
  created_at: string
  modified_at?: string | null
  file_size_bytes?: number | null
}

export interface DatasetColumn {
  name: string
  data_type: string
  nullable: boolean
}

export interface DatasetSchemaResponse {
  columns: DatasetColumn[]
}

export type NumericValueStats = Record<string, number | null>

export interface DatasetColumnInfo {
  name: string
  size_bytes: number
  count_distinct: number
  distinct_values?: Array<string | number> | null
  numeric_values_stats?: NumericValueStats | null
}

export interface DatasetMetaResponse {
  row_count: number
  file_size_bytes: number
  columns_info: DatasetColumnInfo[]
}

export interface UploadResponse {
  dataset_id: string
  created_at: string
}

export interface ReplaceDatasetOptions {
  filename?: string
  contentType?: string
}

export interface UserCreateResponse {
  id: string
  token: string
}

export interface DatasetColumnUserInput {
  value_filter_predicate?: string | Record<string, unknown> | null
  display_formatter?: string | null
  is_categorical?: boolean
}

export interface DatasetColumnStatistics {
  size_bytes: number
  count_distinct: number
  distinct_values?: Array<string | number> | null
  numeric_values_stats?: NumericValueStats | null
}

export interface StoredDatasetColumn {
  id: string
  dataset_id: string
  name: string
  userInput: DatasetColumnUserInput
  statistics: DatasetColumnStatistics
  created_at: string
}

export interface DatasetColumnCreate {
  name: string
  userInput: DatasetColumnUserInput
  statistics: DatasetColumnStatistics
}

export interface DatasetColumnUpdate {
  name?: string | null
  userInput?: DatasetColumnUserInput | null
  statistics?: DatasetColumnStatistics | null
}

export interface RowSet {
  id: string
  workspace_id: string
  name: string
  base_dataset_id: string
  predicate?: Record<string, unknown> | null
  created_at: string
}

export interface QueryRequest {
  sql: string
  workspace_id?: string
}

export interface QueryResponse {
  columns: string[]
  rows: Array<Record<string, any>>
}

export interface RowSetCreate {
  name: string
  workspace_id: string
  base_dataset_id: string
  predicate?: Record<string, unknown> | null
}

export interface RowSetUpdate {
  name?: string | null
  predicate?: Record<string, unknown> | null
}

export interface RowSetSampleResponse {
  row: Record<string, unknown> | null
  columns: string[]
}

export interface FeatureColumnDetail {
  field: string
  is_categorical: boolean
}

export interface ColumnSetCreate {
  dataset_id: string
  name: string
  column_to_predict: string
  feature_columns: Array<string | FeatureColumnDetail>
}

export interface ColumnSet extends ColumnSetCreate {
  id: string
  created_at: string
}

export interface ColumnSetUpdate {
  name?: string | null
  column_to_predict?: string | null
  feature_columns?: Array<string | FeatureColumnDetail> | null
}

export interface TrainingParamSetCreate {
  workspace_id: string
  name: string
  params: Record<string, unknown>
  meta?: Record<string, unknown> | null
}

export interface TrainingParamSet extends TrainingParamSetCreate {
  id: string
  created_at: string
}

export interface TrainingParamSetUpdate {
  name?: string | null
  params?: Record<string, unknown> | null
  meta?: Record<string, unknown> | null
}

export interface ModelDetail {
  id: string
  workspace_id?: string | null
  name?: string | null
  created_at: string
  metrics?: Record<string, unknown> | null
  row_set_id?: string | null
  column_set_id?: string | null
  training_param_set_id?: string | null
  training_seconds?: number | null
}

export interface TrainingRequest {
  workspace_id: string
  row_set_id: string
  column_set_id: string
  training_param_set_id: string
  time_budget_seconds?: number
}

export interface TrainingResponse {
  status: string
  id: string
  metrics: Record<string, unknown>
}

export interface OptimalParamSearchRequest {
  row_set_id: string
  column_set_id: string
  objective: string
  metric?: string
  time_budget_seconds?: number
  validation_fraction?: number
}

export interface OptimalParamSearchResponse {
  status: string
  metric_used: string
  surrogate_metric?: string | null
  trials_run: number
  best_params: Record<string, unknown>
  best_score?: number | null
  best_iteration?: number | null
  best_score_breakdown?: Record<string, unknown> | null
  note?: string | null
  elapsed_seconds?: number | null
}

export interface PredictionRequest {
  features: Array<Record<string, unknown>>
}

export interface PredictionResponse {
  predictions: number[]
}

export interface PredictionWithFreeParameterRequest {
  base_features: Record<string, unknown>
  free_parameter_columns?: string[] | null
  free_parameter_column?: string | null
}

export interface FreeParameterPrediction {
  values: Record<string, unknown>
  prediction: number
}

export interface PredictionWithFreeParameterResponse {
  predictions: FreeParameterPrediction[]
}

// ------------------------------------------------------------
// Client Types
// ------------------------------------------------------------

export type UploadFileInput = Blob | File | Uint8Array | ArrayBuffer

export interface UploadDatasetOptions {
  workspaceId?: string
  alias?: string
  filename?: string
  contentType?: string
}

export interface ClientOptions {
  /** Base URL of gagara-boost server (no trailing slash) */
  baseUrl: string

  /** Service token for Authorization header */
  serviceToken?: string

  /** User token for Authorization header */
  token?: string

  /** Custom fetch implementation */
  fetch?: typeof globalThis.fetch

  /** Default request timeout in ms. Default: 30000 */
  timeout?: number
}

export interface ErrorResponse {
  detail?: string
  error?: string
  [key: string]: unknown
}

// ------------------------------------------------------------
// Error Types
// ------------------------------------------------------------

export class GagaraBoostError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: ErrorResponse
  ) {
    super(message)
    this.name = 'GagaraBoostError'
  }
}
