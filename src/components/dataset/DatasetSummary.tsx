import type { DataSource, DatasetSummaryData } from '../../types/cropcast'

type DatasetSummaryProps = {
  dataset: DatasetSummaryData
  source: DataSource
}

export function DatasetSummary({ dataset, source }: DatasetSummaryProps) {
  return (
    <section className="dataset-summary" aria-labelledby="dataset-summary-title">
      <div className="section-title-row">
        <div>
          <span className="section-number">02</span>
          <h2 id="dataset-summary-title">Dataset structure</h2>
        </div>
        {source === 'demo' && <span className="status-tag demo-tag">Demo dataset</span>}
      </div>
      <dl className="dataset-facts">
        <div><dt>File</dt><dd title={dataset.fileName}>{dataset.fileName}</dd></div>
        <div><dt>Columns</dt><dd>{dataset.columnCount}</dd></div>
        {dataset.rowCount !== undefined && <div><dt>Rows</dt><dd>{dataset.rowCount}</dd></div>}
      </dl>
      <div className="table-scroll" tabIndex={0} aria-label="Dataset columns, horizontally scrollable">
        <table>
          <caption>Structure returned by {source === 'demo' ? 'the sample fixture' : 'the dataset API'}</caption>
          <thead><tr><th>Column</th><th>Type</th><th>Unit</th><th>Use</th></tr></thead>
          <tbody>
            {dataset.columns.map((column) => (
              <tr key={column.id}>
                <th scope="row">{column.label}</th>
                <td>{column.dataType}</td>
                <td>{column.unit ?? 'Not supplied'}</td>
                <td>{[column.eligibleAsTarget && 'Target', column.eligibleAsFeature && 'Feature'].filter(Boolean).join(', ') || 'Reference only'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
