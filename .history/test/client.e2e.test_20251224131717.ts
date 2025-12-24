import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest'
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

// Environment variables for server URL and auth token
const SERVER_URL = process.env.GAGARA_BOOST_SERVER_URL || 'http://localhost:3040'
const AUTH_TOKEN = process.env.GAGARA_BOOST_TOKEN

// Check if server is reachable before running tests
let serverReachable = false

// Attempt to acquire token if not provided and auto-auth is enabled
async function acquireTokenIfNeeded (): Promise<string | undefined> {
  // If token is already provided, use it
  if (AUTH_TOKEN) {
    return AUTH_TOKEN
  }

  // If auto-auth is not enabled, return undefined
  if (!process.env.GAGARA_BOOST_AUTO_AUTH) {
    return undefined
  }

  // Note: This is a placeholder for actual authentication logic
  // In a real implementation, you would call the auth endpoint here
  // For example: /auth/login, /login, etc.
  console.log('Auto-auth enabled but no implementation provided - would need server-specific auth endpoint')
  return undefined
}

// Initialize server reachability before running any tests
beforeAll(async () => {
  try {
    // Try to acquire token if needed
    let token = AUTH_TOKEN
    if (!token && process.env.GAGARA_BOOST_AUTO_AUTH) {
      token = await acquireTokenIfNeeded()
    }

    const client = new GagaraBoostClient({
      baseUrl: SERVER_URL,
      token: token  // Include token for health check if needed
    })
    serverReachable = await client.health()
  } catch (error) {
    console.log(`Skipping E2E tests: Server not reachable at ${SERVER_URL}`)
    serverReachable = false
  }
})

// Helper function to conditionally run tests
function runIfServerReachable (testFn: () => Promise<void>): () => Promise<void> {
  return async () => {
    if (!serverReachable) {
      console.log('Skipping test: server not reachable')
      return
    }
    await testFn()
  }
}

describe('GagaraBoostClient - Live Server Tests', () => {
  let client: GagaraBoostClient

  beforeAll(async () => {
    if (!serverReachable) return

    if (AUTH_TOKEN) {
      client = new GagaraBoostClient({ baseUrl: SERVER_URL, token: AUTH_TOKEN })
      return
    }

    // No token provided — try to create a user via public endpoint and set token on client
    client = new GagaraBoostClient({ baseUrl: SERVER_URL })
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
      expect(workspaces).toHaveLength(1)
      expect(workspaces[0]).toHaveProperty('id')
      expect(workspaces[0]).toHaveProperty('name')
      expect(workspaces[0]).toHaveProperty('created_at')
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
      // Create a test dataset by uploading a small CSV file
      const csvData = 'id,name,value\n1,Alice,100\n2,Bob,200\n3,Charlie,300'
      const file = new Blob([csvData], { type: 'text/csv' })

      const uploadResponse = await client.uploadDataset(file, {
        workspaceId: workspace.id,
        alias: `test-dataset-${Date.now()}`,
        filename: 'test.csv',
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
      expect(schema.columns).toHaveLength(3) // id, name, value

      const columnNames = schema.columns.map(col => col.name)
      expect(columnNames).toContain('id')
      expect(columnNames).toContain('name')
      expect(columnNames).toContain('value')
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
  })

  describe('row sets', () => {
    let workspace: Workspace
    let dataset: DatasetItem

    beforeAll(runIfServerReachable(async () => {
      workspace = await client.createWorkspace(`test-rowset-${Date.now()}`)

      // Create a test dataset
      const csvData = 'id,name,value\n1,Alice,100\n2,Bob,200\n3,Charlie,300'
      const file = new Blob([csvData], { type: 'text/csv' })

      const uploadResponse = await client.uploadDataset(file, {
        workspaceId: workspace.id,
        alias: `test-dataset-${Date.now()}`,
        filename: 'test.csv',
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

    it('should create and list row sets', runIfServerReachable(async () => {
      const rowSetData = {
        name: `test-rowset-${Date.now()}`,
        workspace_id: workspace.id,
        base_dataset_id: dataset.id,
        predicate: { name: { $like: '%A%' } }, // Filter for names containing 'A'
      }

      const createdRowSet = await client.createRowSet(rowSetData)
      expect(createdRowSet).toHaveProperty('id')
      expect(createdRowSet.name).toBe(rowSetData.name)

      const rowSets = await client.listRowSets(workspace.id)
      expect(rowSets).toHaveLength(1)
      expect(rowSets[0].id).toBe(createdRowSet.id)
    }))
  })

  describe('column sets', () => {
    let workspace: Workspace
    let dataset: DatasetItem

    beforeAll(runIfServerReachable(async () => {
      workspace = await client.createWorkspace(`test-columnset-${Date.now()}`)

      // Create a test dataset
      const csvData = 'id,name,value,target\n1,Alice,100,1\n2,Bob,200,0\n3,Charlie,300,1'
      const file = new Blob([csvData], { type: 'text/csv' })

      const uploadResponse = await client.uploadDataset(file, {
        workspaceId: workspace.id,
        alias: `test-dataset-${Date.now()}`,
        filename: 'test.csv',
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

    it('should create and list column sets', runIfServerReachable(async () => {
      const columnSetData = {
        dataset_id: dataset.id,
        name: `test-columnset-${Date.now()}`,
        column_to_predict: 'target',
        feature_columns: ['value'],
      }

      const createdColumnSet = await client.createColumnSet(columnSetData)
      expect(createdColumnSet).toHaveProperty('id')
      expect(createdColumnSet.name).toBe(columnSetData.name)

      const columnSets = await client.listColumnSets({ datasetId: dataset.id })
      expect(columnSets).toHaveLength(1)
      expect(columnSets[0].id).toBe(createdColumnSet.id)
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

describe('GagaraBoostClient - Training and Prediction Tests', () => {
  let client: GagaraBoostClient
  let workspace: Workspace
  let dataset: DatasetItem
  let rowSet: any
  let columnSet: any

  beforeAll(() => {
    if (serverReachable) {
      client = new GagaraBoostClient({
        baseUrl: SERVER_URL,
        token: AUTH_TOKEN
      })
    }
  })

  // If no env token is provided, try to auto-create a user for this suite as well
  beforeAll(runIfServerReachable(async () => {
    if (AUTH_TOKEN) return
    try {
      // client may already be set by outer scope; create local if not
      if (!client) client = new GagaraBoostClient({ baseUrl: SERVER_URL })
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

    // Create a test dataset
    const csvData = 'id,name,value,target\n1,Alice,100,1\n2,Bob,200,0\n3,Charlie,300,1\n4,Dave,150,0'
    const file = new Blob([csvData], { type: 'text/csv' })

    const uploadResponse = await client.uploadDataset(file, {
      workspaceId: workspace.id,
      alias: `test-training-dataset-${Date.now()}`,
      filename: 'test.csv',
    })

    dataset = await client.getDataset(uploadResponse.dataset_id)

    // Create a row set
    rowSet = await client.createRowSet({
      name: `test-training-rowset-${Date.now()}`,
      workspace_id: workspace.id,
      base_dataset_id: dataset.id,
    })

    // Create a column set
    columnSet = await client.createColumnSet({
      dataset_id: dataset.id,
      name: `test-training-columnset-${Date.now()}`,
      column_to_predict: 'target',
      feature_columns: ['value'],
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

    // Clean up the param set
    await client.deleteTrainingParamSet(paramSet.id)
  }))
})