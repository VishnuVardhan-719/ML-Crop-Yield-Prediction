import { useRef, useState } from 'react'
import type { DragEvent } from 'react'
import type { DatasetStatus } from '../../types/cropcast'
import { validateDatasetFile } from './datasetValidation'

type FileDropzoneProps = {
  status: DatasetStatus
  message?: string
  onFile: (file: File) => void
  onInvalid: (message: string) => void
  onDemo: () => void
}

export function FileDropzone({ status, message, onFile, onInvalid, onDemo }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const busy = status === 'uploading'

  const accept = (file?: File) => {
    if (!file) return
    const error = validateDatasetFile(file)
    if (error) onInvalid(error)
    else onFile(file)
  }

  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    accept(event.dataTransfer.files[0])
  }

  return (
    <div className="upload-entry">
      <div
        className={`dropzone${isDragging ? ' is-dragging' : ''}${busy ? ' is-busy' : ''}`}
        onDragEnter={(event) => { event.preventDefault(); setIsDragging(true) }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={drop}
      >
        <input
          ref={inputRef}
          className="visually-hidden"
          id="dataset-file"
          type="file"
          accept=".csv,.xlsx,.zip,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/zip"
          disabled={busy}
          aria-label="Choose dataset file"
          onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; accept(file) }}
        />
        <div>
          <p className="dropzone-lead">{busy ? 'Sending dataset for analysis…' : 'Drop CSV, Excel, or ZIP here.'}</p>
          <p className="field-help">Maximum file size: 10 MB. ZIP files are inspected, never silently merged.</p>
        </div>
        <button className="button button-primary" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? 'Uploading…' : 'Browse files'}
        </button>
      </div>
      {(status === 'invalid' || status === 'error') && message && <p className="inline-alert" role="alert">{message}</p>}
      <div className="sample-action">
        <span>No dataset ready?</span>
        <a className="text-button" href="/sample-datasets/sample-field-trials.csv" download>Download sample dataset</a>
        <button type="button" className="text-button" disabled={busy} onClick={onDemo}>Run demo analysis</button>
      </div>
      <p className="field-help">The sample CSV is synthetic. Upload it to train models and predict a new record. Demo analysis only previews a saved report.</p>
    </div>
  )
}
