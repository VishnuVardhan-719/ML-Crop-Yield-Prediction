import { useEffect, useState } from 'react'

const formatSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`

const elapsedLabel = (seconds: number) => seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`

/**
 * The backend applies one request and does not stream stage updates, so this reports only what is
 * actually known: the file being processed and how long it has been running. An earlier version
 * listed eleven named stages with invented complete/active states.
 */
export function AnalysisProgress({ fileName, fileSize, fileType, source }: { fileName: string; fileSize: number; fileType: string; source: 'uploaded' | 'demo' }) {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setSeconds((current) => current + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <section className="analysis-progress" aria-labelledby="analysis-progress-title" aria-live="polite" aria-busy="true">
      <div className="analysis-progress-head">
        <div>
          <p className="kicker">CropCast analysis</p>
          <h2 id="analysis-progress-title">Analyzing {fileName}</h2>
        </div>
        {source === 'demo' && <span className="status-tag demo-tag">Demo mode</span>}
      </div>
      <dl className="processing-file-meta"><div><dt>File size</dt><dd>{formatSize(fileSize)}</dd></div><div><dt>File type</dt><dd>{fileType}</dd></div><div><dt>Elapsed</dt><dd>{elapsedLabel(seconds)}</dd></div></dl>
      <div className="indeterminate-progress" role="progressbar" aria-label="Analysis in progress"><i /></div>
      <p className="analysis-progress-note">
        CropCast fits and cross-validates four models with a mean baseline. Small datasets take well under a
        minute; files with tens of thousands of rows can take a few minutes because the Random Forest is
        re-fitted on every split. This panel shows no stage-level detail because the API does not stream any.
      </p>
    </section>
  )
}
