import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  GagaraBoostClient,
  DatasetItem,
  Workspace,
  GagaraBoostError,
} from '../src/index.js'

/**
 * E2E Tests for GagaraBoostClient
 *
 * To run these tests, you need:
 * 1. A running gagara-boost server (default: http://localhost:3040)
 * 2. A valid authentication token (set GAGARA_BOOST_TOKEN environment variable)
 *
 * Alternatively, if the server supports public authentication endpoints, you can enable auto-auth:
 * - Set GAGARA_BOOST_AUTO_AUTH=1 to enable auto-authentication (placeholder implementation)
 *
 * Examples:
 * # With explicit token:
 * GAGARA_BOOST_SERVER_URL=http://localhost:3040 GAGARA_BOOST_TOKEN=your_valid_token pnpm test
 *
 * # With auto-auth (requires implementation of actual auth endpoint):
 * GAGARA_BOOST_SERVER_URL=http://localhost:3040 GAGARA_BOOST_AUTO_AUTH=1 pnpm test
 */

// Environment variables for server URL and auth tokens
const SERVER_URL = process.env.GAGARA_BOOST_SERVER_URL || 'http://localhost:3040'
const USER_TOKEN = process.env.GAGARA_BOOST_USER_TOKEN
const SERVICE_TOKEN = process.env.GAGARA_BOOST_SERVICE_TOKEN
const CLIENT_TIMEOUT = Number(process.env.GAGARA_BOOST_CLIENT_TIMEOUT_MS) || 30_000
const DEFAULT_PARQUET_PATH = path.resolve(
  process.cwd(),
  '../gagara-boost/test-data/datasets/05bfc6ee-8c08-4897-94a3-d33eabb64ca6.parquet'
)

let cachedParquetPath: string | null = null

async function resolveParquetPath (): Promise<string> {
  if (process.env.GAGARA_BOOST_TEST_DATASET_PATH) {
    return process.env.GAGARA_BOOST_TEST_DATASET_PATH
  }

  if (cachedParquetPath) {
    return cachedParquetPath
  }

  try {
    await fs.access(DEFAULT_PARQUET_PATH)
    cachedParquetPath = DEFAULT_PARQUET_PATH
    return cachedParquetPath
  } catch {
    // fallthrough
  }

  const fallbackDir = path.resolve(process.cwd(), '../gagara-boost/test-data/datasets')
  try {
    const entries = await fs.readdir(fallbackDir)
    const parquet = entries.find((entry) => entry.endsWith('.parquet'))
    if (parquet) {
      cachedParquetPath = path.join(fallbackDir, parquet)
      return cachedParquetPath
    }
  } catch {
    // fallthrough
  }

  throw new Error(
    'No Parquet test dataset found. Set GAGARA_BOOST_TEST_DATASET_PATH to a .parquet file.'
  )
}

async function loadParquetBytes (): Promise<{ bytes: Uint8Array, filename: string }> {
  const parquetPath = await resolveParquetPath()
  const buffer = await fs.readFile(parquetPath)
  return { bytes: new Uint8Array(buffer), filename: path.basename(parquetPath) }
}

type TokenContext = {
  label: string
  token?: string
}

const tokenContexts: TokenContext[] = [
  { label: 'user token', token: USER_TOKEN },
  { label: 'service token', token: SERVICE_TOKEN },
]

function defineSuite ({ label, token }: TokenContext): void {
  let serverReachable = false
  const normalizedToken = token || undefined

  // Attempt to acquire token if not provided and auto-auth is enabled
  async function acquireTokenIfNeeded (): Promise<string | undefined> {
    if (token) {
      return token
    }

    if (!process.env.GAGARA_BOOST_AUTO_AUTH) {
      return undefined
    }

    console.log('Auto-auth enabled but no implementation provided - would need server-specific auth endpoint')
    return undefined
  }

  beforeAll(async () => {
    try {
      let activeToken = normalizedToken
      if (!activeToken && process.env.GAGARA_BOOST_AUTO_AUTH) {
        activeToken = await acquireTokenIfNeeded()
      }

      const client = new GagaraBoostClient({
        baseUrl: SERVER_URL,
        token: activeToken,
        timeout: CLIENT_TIMEOUT,
      })
      serverReachable = await client.health()
    } catch (error) {
      console.log(`Skipping E2E tests: Server not reachable at ${SERVER_URL}`)
      serverReachable = false
    }
  })

  function runIfServerReachable (testFn: () => Promise<void>): () => Promise<void> {
    return async () => {
      if (!serverReachable) {
        console.log('Skipping test: server not reachable')
        return
      }
      await testFn()
    }
  }

  describe(`GagaraBoostClient - Live Server Tests (${label})`, () => {
    let client: GagaraBoostClient

    beforeAll(async () => {
      if (!serverReachable) return

      if (normalizedToken) {
        client = new GagaraBoostClient({ baseUrl: SERVER_URL, token: normalizedToken, timeout: CLIENT_TIMEOUT })
        return
      }

      // No token provided — try to create a user via public endpoint and set token on client
      client = new GagaraBoostClient({ baseUrl: SERVER_URL, timeout: CLIENT_TIMEOUT })
      try {
        if (typeof client.createUserAndSetToken === 'function') {
          await client.createUserAndSetToken()
        } else if (typeof client.createUser === 'function') {
          const resp = await client.createUser()
          client.setToken(resp.token)
        }
      } catch (err) {
        // If auto-creation fails, leave client without token; tests will skip if auth required
        // Log for diagnostics
        // eslint-disable-next-line no-console
        console.warn('Auto-create user failed for e2e tests:', err)
      }
    })

    describe('health', () => {
      it('should return true when server is healthy', async () => {
        if (!serverReachable) {
          console.log('Skipping test: server not reachable')
          return
        }
        const isHealthy = await client.health()
        expect(isHealthy).toBe(true)
      })
    })

    describe('workspaces', () => {
      let workspace: Workspace

      beforeEach(runIfServerReachable(async () => {
        // Create a test workspace
        workspace = await client.createWorkspace(`test-${Date.now()}`)
      }))

      afterEach(runIfServerReachable(async () => {
        // Clean up the workspace
        if (workspace) {
          try {
            await client.deleteWorkspace(workspace.id)
          } catch {
            // Workspace might have been deleted in the test, ignore errors
          }
        }
      }))

      it('should create and list workspaces', runIfServerReachable(async () => {
      const workspaces = await client.listWorkspaces()
      expect(workspaces.length).toBeGreaterThan(0)
      expect(workspaces.some((item) => item.id === workspace.id)).toBe(true)
      }))

      it('should get a specific workspace', runIfServerReachable(async () => {
        const fetchedWorkspace = await client.getWorkspace(workspace.id)
        expect(fetchedWorkspace.id).toBe(workspace.id)
        expect(fetchedWorkspace.name).toBe(workspace.name)
      }))

      it('should rename a workspace', runIfServerReachable(async () => {
        const newName = `renamed-${Date.now()}`
        const renamedWorkspace = await client.renameWorkspace(workspace.id, newName)
        expect(renamedWorkspace.name).toBe(newName)
      }))
    })

    describe('datasets', () => {
      let workspace: Workspace
      let dataset: DatasetItem

      beforeAll(runIfServerReachable(async () => {
        workspace = await client.createWorkspace(`test-dataset-${Date.now()}`)
      }))

      afterAll(runIfServerReachable(async () => {
        // Clean up workspace
        if (workspace) {
          try {
            await client.deleteWorkspace(workspace.id)
          } catch {
            // Ignore errors during cleanup
          }
        }
      }))

      beforeEach(runIfServerReachable(async () => {
      const { bytes, filename } = await loadParquetBytes()

      const uploadResponse = await client.uploadDataset(bytes, {
        workspaceId: workspace.id,
        alias: `test-dataset-${Date.now()}`,
        filename,
      })

        dataset = await client.getDataset(uploadResponse.dataset_id)
      }))

      afterEach(runIfServerReachable(async () => {
        // Clean up the dataset
        if (dataset) {
          try {
            await client.deleteDataset(dataset.id)
          } catch {
            // Dataset might have been deleted in the test, ignore errors
          }
        }
      }))

      it('should upload and list datasets', runIfServerReachable(async () => {
        const datasets = await client.listDatasets(workspace.id)
        expect(datasets).toHaveLength(1)
        expect(datasets[0]).toHaveProperty('id')
        expect(datasets[0]).toHaveProperty('alias')
        expect(datasets[0]).toHaveProperty('workspace_id')
        expect(datasets[0].workspace_id).toBe(workspace.id)
      }))

      it('should get dataset metadata', runIfServerReachable(async () => {
        const meta = await client.getDatasetMeta(dataset.id)
        expect(meta).toHaveProperty('row_count')
        expect(meta).toHaveProperty('file_size_bytes')
        expect(meta).toHaveProperty('columns_info')
        expect(typeof meta.row_count).toBe('number')
        expect(typeof meta.file_size_bytes).toBe('number')
        expect(Array.isArray(meta.columns_info)).toBe(true)
      }))

      it('should get dataset schema', runIfServerReachable(async () => {
      const schema = await client.getDatasetSchema(dataset.id)
      expect(schema).toHaveProperty('columns')
      expect(Array.isArray(schema.columns)).toBe(true)
      expect(schema.columns.length).toBeGreaterThan(0)
      }))

      it('should update dataset alias', runIfServerReachable(async () => {
        const newAlias = `updated-${Date.now()}`
        const updatedDataset = await client.updateDatasetAlias(dataset.id, newAlias)
        expect(updatedDataset.alias).toBe(newAlias)
      }))

      it('should refresh dataset metadata', runIfServerReachable(async () => {
        const refreshedMeta = await client.refreshDatasetMeta(dataset.id)
        expect(refreshedMeta).toHaveProperty('row_count')
        expect(refreshedMeta).toHaveProperty('file_size_bytes')
        expect(typeof refreshedMeta.row_count).toBe('number')
      }))

      it('should list dataset columns', runIfServerReachable(async () => {
      await client.refreshDatasetMeta(dataset.id)
      const columns = await client.listDatasetColumns(dataset.id)
      expect(Array.isArray(columns)).toBe(true)
      expect(columns.length).toBeGreaterThan(0)
      expect(columns[0]).toHaveProperty('name')
      }))

      it('should download dataset', runIfServerReachable(async () => {
        const data = await client.downloadDataset(dataset.id)
        expect(data).toBeInstanceOf(ArrayBuffer)
        expect(data.byteLength).toBeGreaterThan(0)
      }))
    })

    describe('row sets', () => {
      let workspace: Workspace
      let dataset: DatasetItem

      beforeAll(runIfServerReachable(async () => {
        workspace = await client.createWorkspace(`test-rowset-${Date.now()}`)

      const { bytes, filename } = await loadParquetBytes()

      const uploadResponse = await client.uploadDataset(bytes, {
        workspaceId: workspace.id,
        alias: `test-dataset-${Date.now()}`,
        filename,
      })

        dataset = await client.getDataset(uploadResponse.dataset_id)
      }))

      afterAll(runIfServerReachable(async () => {
        // Clean up
        try {
          await client.deleteDataset(dataset.id)
        } catch { }
        try {
          await client.deleteWorkspace(workspace.id)
        } catch { }
      }))

      it('should create and manage row sets', runIfServerReachable(async () => {
      const rowSetData = {
        name: `test-rowset-${Date.now()}`,
        workspace_id: workspace.id,
        base_dataset_id: dataset.id,
        predicate: null,
      }

        const createdRowSet = await client.createRowSet(rowSetData)
        expect(createdRowSet).toHaveProperty('id')
        expect(createdRowSet.name).toBe(rowSetData.name)

        const fetchedRowSet = await client.getRowSet(createdRowSet.id)
        expect(fetchedRowSet.id).toBe(createdRowSet.id)

        const updatedName = `updated-rowset-${Date.now()}`
        const updatedRowSet = await client.updateRowSet(createdRowSet.id, { name: updatedName })
        expect(updatedRowSet.name).toBe(updatedName)

        const rowSets = await client.listRowSets(workspace.id)
        expect(rowSets).toHaveLength(1)
        expect(rowSets[0].id).toBe(createdRowSet.id)

        const schema = await client.getRowSetSchema(createdRowSet.id)
        expect(schema).toHaveProperty('columns')
        expect(Array.isArray(schema.columns)).toBe(true)

        const meta = await client.getRowSetMeta(createdRowSet.id)
        expect(meta).toHaveProperty('row_count')

        const sample = await client.getRowSetSample(createdRowSet.id)
        expect(sample).toHaveProperty('columns')
        expect(Array.isArray(sample.columns)).toBe(true)

        await client.deleteRowSet(createdRowSet.id)
      }))
    })

    describe('column sets', () => {
      let workspace: Workspace
      let dataset: DatasetItem

      beforeAll(runIfServerReachable(async () => {
        workspace = await client.createWorkspace(`test-columnset-${Date.now()}`)

      const { bytes, filename } = await loadParquetBytes()

      const uploadResponse = await client.uploadDataset(bytes, {
        workspaceId: workspace.id,
        alias: `test-dataset-${Date.now()}`,
        filename,
      })

        dataset = await client.getDataset(uploadResponse.dataset_id)
      }))

      afterAll(runIfServerReachable(async () => {
        // Clean up
        try {
          await client.deleteDataset(dataset.id)
        } catch { }
        try {
          await client.deleteWorkspace(workspace.id)
        } catch { }
      }))

      it('should create and manage column sets', runIfServerReachable(async () => {
      const schema = await client.getDatasetSchema(dataset.id)
      const columnNames = schema.columns.map(col => col.name)
      if (columnNames.length < 2) {
        console.log('Skipping test: dataset has insufficient columns for column set')
        return
      }

      const columnSetData = {
        dataset_id: dataset.id,
        name: `test-columnset-${Date.now()}`,
        column_to_predict: columnNames[0],
        feature_columns: columnNames.slice(1),
      }

        const createdColumnSet = await client.createColumnSet(columnSetData)
        expect(createdColumnSet).toHaveProperty('id')
        expect(createdColumnSet.name).toBe(columnSetData.name)

        const columnSets = await client.listColumnSets({ datasetId: dataset.id })
        expect(columnSets).toHaveLength(1)
        expect(columnSets[0].id).toBe(createdColumnSet.id)

        const fetchedColumnSet = await client.getColumnSet(createdColumnSet.id)
        expect(fetchedColumnSet.id).toBe(createdColumnSet.id)

        const updatedName = `updated-columnset-${Date.now()}`
        const updatedColumnSet = await client.updateColumnSet(createdColumnSet.id, {
          name: updatedName,
        })
        expect(updatedColumnSet.name).toBe(updatedName)

        const clonedColumnSet = await client.cloneColumnSet(createdColumnSet.id)
        expect(clonedColumnSet).toHaveProperty('id')
        expect(clonedColumnSet.id).not.toBe(createdColumnSet.id)

        await client.deleteColumnSet(clonedColumnSet.id)
        await client.deleteColumnSet(createdColumnSet.id)
      }))
    })

    describe('error handling', () => {
      it('should throw GagaraBoostError for non-existent workspace', runIfServerReachable(async () => {
        await expect(client.getWorkspace('non-existent-id')).rejects.toThrow(GagaraBoostError)
      }))

      it('should throw GagaraBoostError for non-existent dataset', runIfServerReachable(async () => {
        await expect(client.getDataset('non-existent-id')).rejects.toThrow(GagaraBoostError)
      }))
    })
  })

  describe(`GagaraBoostClient - Training and Prediction Tests (${label})`, () => {
    let client: GagaraBoostClient
    let workspace: Workspace
    let dataset: DatasetItem
    let rowSet: any
    let columnSet: any

    beforeAll(() => {
      if (serverReachable) {
        client = new GagaraBoostClient({
          baseUrl: SERVER_URL,
          token: normalizedToken,
          timeout: CLIENT_TIMEOUT,
        })
      }
    })

    // If no env token is provided, try to auto-create a user for this suite as well
    beforeAll(runIfServerReachable(async () => {
      if (normalizedToken) return
      try {
        // client may already be set by outer scope; create local if not
        if (!client) client = new GagaraBoostClient({ baseUrl: SERVER_URL, timeout: CLIENT_TIMEOUT })
        if (typeof client.createUserAndSetToken === 'function') {
          await client.createUserAndSetToken()
        } else if (typeof client.createUser === 'function') {
          const resp = await client.createUser()
          client.setToken(resp.token)
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('Auto-create user failed for training tests:', err)
      }
    }))

    beforeAll(runIfServerReachable(async () => {
      workspace = await client.createWorkspace(`test-training-${Date.now()}`)

    const { bytes, filename } = await loadParquetBytes()

    const uploadResponse = await client.uploadDataset(bytes, {
      workspaceId: workspace.id,
      alias: `test-training-dataset-${Date.now()}`,
      filename,
    })

      dataset = await client.getDataset(uploadResponse.dataset_id)

      // Create a row set
      rowSet = await client.createRowSet({
        name: `test-training-rowset-${Date.now()}`,
        workspace_id: workspace.id,
        base_dataset_id: dataset.id,
      })

    const schema = await client.getDatasetSchema(dataset.id)
    const columnNames = schema.columns.map(col => col.name)
    if (columnNames.length < 2) {
      throw new Error('Training tests require at least 2 columns in the dataset')
    }

    const targetColumn = columnNames[0]
    const featureColumns = columnNames.slice(1)

    // Create a column set
    columnSet = await client.createColumnSet({
      dataset_id: dataset.id,
      name: `test-training-columnset-${Date.now()}`,
      column_to_predict: targetColumn,
      feature_columns: featureColumns,
    })
    }))

    afterAll(runIfServerReachable(async () => {
      // Clean up
      try {
        if (rowSet?.id) await client.deleteRowSet(rowSet.id)
      } catch { }
      try {
        if (columnSet?.id) await client.deleteColumnSet(columnSet.id)
      } catch { }
      try {
        if (dataset?.id) await client.deleteDataset(dataset.id)
      } catch { }
      try {
        if (workspace?.id) await client.deleteWorkspace(workspace.id)
      } catch { }
    }))

    it('should create training param set', runIfServerReachable(async () => {
      const paramSetData = {
        workspace_id: workspace.id,
        name: `test-paramset-${Date.now()}`,
        params: {
          max_depth: 5,
          learning_rate: 0.1,
        },
      }

      const createdParamSet = await client.createTrainingParamSet(paramSetData)
      expect(createdParamSet).toHaveProperty('id')
      expect(createdParamSet.name).toBe(paramSetData.name)

      const fetchedParamSet = await client.getTrainingParamSet(createdParamSet.id)
      expect(fetchedParamSet.id).toBe(createdParamSet.id)

      const paramSets = await client.listTrainingParamSets(workspace.id)
      expect(paramSets.length).toBeGreaterThan(0)

      const updatedName = `updated-paramset-${Date.now()}`
      const updatedParamSet = await client.updateTrainingParamSet(createdParamSet.id, {
        name: updatedName,
      })
      expect(updatedParamSet.name).toBe(updatedName)

      await client.deleteTrainingParamSet(createdParamSet.id)
    }))

    it('should train a model', runIfServerReachable(async () => {
      // First create a training param set
      const paramSetData = {
        workspace_id: workspace.id,
        name: `test-train-paramset-${Date.now()}`,
        params: {
          max_depth: 3,
          learning_rate: 0.1,
        },
      }

      const paramSet = await client.createTrainingParamSet(paramSetData)

      // Train a model
      const trainRequest = {
        workspace_id: workspace.id,
        row_set_id: rowSet.id,
        column_set_id: columnSet.id,
        training_param_set_id: paramSet.id,
      }

      const trainResponse = await client.train(trainRequest)
      expect(trainResponse).toHaveProperty('status')
      expect(trainResponse).toHaveProperty('id')
      expect(trainResponse.status).toBe('success')

      const models = await client.listModels({ workspaceId: workspace.id })
      expect(Array.isArray(models)).toBe(true)

      const model = await client.getModel(trainResponse.id)
      expect(model.id).toBe(trainResponse.id)

      const renamedModel = await client.renameModel(trainResponse.id, `renamed-model-${Date.now()}`)
      expect(renamedModel.id).toBe(trainResponse.id)

      const prediction = await client.predict(trainResponse.id, {
        features: [{ value: 120 }],
      })
      expect(Array.isArray(prediction.predictions)).toBe(true)
      expect(prediction.predictions.length).toBe(1)

      await client.deleteModel(trainResponse.id)

      // Clean up the param set
      await client.deleteTrainingParamSet(paramSet.id)
    }))
  })
}

for (const context of tokenContexts) {
  defineSuite(context)
}
