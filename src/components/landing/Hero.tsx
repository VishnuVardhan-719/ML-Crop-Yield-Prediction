import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileDropzone } from '../dataset/FileDropzone'
import type { DatasetStatus } from '../../types/cropcast'

export function Hero() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<DatasetStatus>('idle')
  const [message, setMessage] = useState<string>()

  const invalid = (error: string) => {
    setStatus('invalid')
    setMessage(error)
  }

  return (
    <section className="landing-hero">
      <div className="container hero-layout">
        <div className="hero-copy-block">
          <p className="kicker">Automated agricultural machine learning</p>
          <h1>Drop your agricultural data. CropCast does the analysis.</h1>
          <p>Profile the dataset, prepare features, compare four regression models, and receive one understandable prediction report.</p>
          <a className="quiet-link" href="#product-flow">See how it works</a>
        </div>
        <div className="hero-upload">
          <FileDropzone
            status={status}
            message={message}
            onFile={(file) => navigate('/analysis', { state: { file } })}
            onInvalid={invalid}
            onDemo={() => navigate('/analysis', { state: { demo: true } })}
          />
          <ol className="hero-pipeline" aria-label="CropCast analysis flow"><li>Dataset</li><li>Analysis</li><li>Models</li><li>Prediction</li><li>Explanation</li></ol>
          <p className="integration-note"><span />Demo mode is isolated. Uploaded data requires the analysis API.</p>
        </div>
      </div>
    </section>
  )
}
