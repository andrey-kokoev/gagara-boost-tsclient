# gagara-boost-tsclient

TypeScript client for [gagara-boost](https://github.com/your-org/gagara-boost) — a LightGBM training and prediction service.

## Installation

```bash
npm install @gagara/gagara-boost-tsclient
```

## Quick Start

```typescript
import { GagaraBoostClient } from '@gagara/gagara-boost-tsclient';

const client = new GagaraBoostClient({
  baseUrl: 'https://gagara-boost.example.com',
  token: process.env.GAGARA_TOKEN,
});

// Health check
const ok = await client.health();

// Create a workspace
const workspace = await client.createWorkspace('my-workspace');

// Upload a dataset (Parquet)
const file = await fetch('/data/train.parquet').then((r) => r.arrayBuffer());
const upload = await client.uploadDataset(file, {
  workspaceId: workspace.id,
  alias: 'train-data',
  filename: 'train.parquet',
});

// Create a row set
const rowSet = await client.createRowSet({
  workspace_id: workspace.id,
  name: 'train-slice',
  base_dataset_id: upload.dataset_id,
  predicate: null,
});
```

## API Overview

### GagaraBoostClient

```typescript
const client = new GagaraBoostClient({
  baseUrl: string,
  token?: string,
  fetch?: typeof fetch,
  timeout?: number,
});
```

### Workspaces

- `listWorkspaces()`
- `createWorkspace(name | { name })`
- `getWorkspace(id)`
- `renameWorkspace(id, name)`
- `deleteWorkspace(id)`

### Datasets

- `listDatasets(workspaceId?)`
- `getDataset(id)`
- `uploadDataset(file, { workspaceId?, alias?, filename?, contentType? })`
- `downloadDataset(id)`
- `deleteDataset(id)`
- `updateDatasetAlias(id, alias)`
- `getDatasetMeta(id)`
- `refreshDatasetMeta(id)`
- `getDatasetSchema(id)`
- `listDatasetColumns(datasetId)`
- `createDatasetColumn(datasetId, payload)`
- `updateDatasetColumn(datasetId, columnId, payload)`

### Row Sets

- `listRowSets(workspaceId?)`
- `getRowSet(id)`
- `createRowSet(payload)`
- `updateRowSet(id, payload)`
- `deleteRowSet(id)`
- `getRowSetSchema(id)`
- `getRowSetMeta(id, { force? })`
- `getRowSetSample(id)`

### Column Sets

- `listColumnSets({ workspaceId?, datasetId? })`
- `getColumnSet(id)`
- `createColumnSet(payload)`
- `cloneColumnSet(id)`
- `updateColumnSet(id, payload)`
- `deleteColumnSet(id)`

### Training Param Sets

- `listTrainingParamSets(workspaceId?)`
- `getTrainingParamSet(id)`
- `createTrainingParamSet(payload)`
- `updateTrainingParamSet(id, payload)`
- `deleteTrainingParamSet(id)`

### Models

- `listModels({ workspaceId?, datasetId? })`
- `getModel(id)`
- `renameModel(id, name)`
- `deleteModel(id)`

### Actions

- `train(request)`
- `calculateOptimalParamSet(request)`
- `predict(modelId, request)`
- `predictWithFreeParameter(modelId, request)`

## Error Handling

```typescript
import { GagaraBoostError } from '@gagara/gagara-boost-tsclient';

try {
  await client.getWorkspace('missing');
} catch (err) {
  if (err instanceof GagaraBoostError) {
    console.error(err.status, err.message, err.body);
  }
}
```

## Notes

- Gagara Boost expects a bearer token in the `Authorization` header for all requests.
- Datasets must be uploaded in Parquet format.

## License

Apache-2.0
