import type { AnalysisStage } from '../../types/analysis'

const formatSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`

export function AnalysisProgress({ fileName, fileSize, fileType, source, stages }: { fileName: string; fileSize: number; fileType: string; source: 'uploaded' | 'demo'; stages: AnalysisStage[] }) {
  return (
    <section className="analysis-progress" aria-labelledby="analysis-progress-title" aria-live="polite">
      <div className="analysis-progress-head">
        <div>
          <p className="kicker">CropCast analysis</p>
          <h2 id="analysis-progress-title">Analyzing {fileName}</h2>
        </div>
        {source === 'demo' && <span className="status-tag demo-tag">Demo mode</span>}
      </div>
      <dl className="processing-file-meta"><div><dt>File size</dt><dd>{formatSize(fileSize)}</dd></div><div><dt>File type</dt><dd>{fileType}</dd></div></dl>
      <p className="analysis-progress-note">The interface reports only confirmed backend states. Detailed stage updates will replace pending items when live analysis telemetry is available.</p>
      <ol className="analysis-stage-list">
        {stages.map((stage) => <li key={stage.id} data-state={stage.status}><span aria-hidden="true" /> <strong>{stage.label}</strong>{stage.detail && <small>{stage.detail}</small>}</li>)}
      </ol>
    </section>
  )
}
