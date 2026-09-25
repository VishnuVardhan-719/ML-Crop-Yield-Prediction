import { useEffect, useState } from 'react'
import type { Language, VoiceStatus } from '../../types/cropcast'
import { voiceService } from '../../services/voiceService'

const locales: Record<Language, { code: string; name: string }> = {
  en: { code: 'en-IN', name: 'English' },
  hi: { code: 'hi-IN', name: 'Hindi' },
  te: { code: 'te-IN', name: 'Telugu' },
}

type VoiceControlsProps = {
  text: string
  language: Language
  status: VoiceStatus
  message?: string
  onStatusChange: (status: VoiceStatus, message?: string) => void
}

export function VoiceControls({ text, language, status, message, onStatusChange }: VoiceControlsProps) {
  const supported = voiceService.isSupported()
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => supported ? voiceService.getVoices() : [])

  useEffect(() => {
    if (!supported) return
    const updateVoices = () => setVoices(voiceService.getVoices())
    const unsubscribe = voiceService.subscribe(updateVoices)
    updateVoices()
    return unsubscribe
  }, [supported])

  const play = () => {
    if (!supported) return onStatusChange('unavailable', 'Voice playback is not supported in this browser.')
    if (status === 'paused') {
      voiceService.resume()
      return onStatusChange('playing')
    }
    const locale = locales[language]
    const exact = voices.find((voice) => voice.lang.toLowerCase() === locale.code.toLowerCase())
    const base = voices.find((voice) => voice.lang.toLowerCase().startsWith(`${language}-`) || voice.lang.toLowerCase() === language)
    const voice = exact ?? base
    if (!voice) return onStatusChange('unavailable', `No ${locale.name} voice is installed in this browser.`)
    voiceService.stop()
    const utterance = voiceService.createUtterance(text)
    utterance.lang = locale.code
    utterance.voice = voice
    utterance.onstart = () => onStatusChange('playing')
    utterance.onend = () => onStatusChange('stopped')
    utterance.onerror = () => onStatusChange('unavailable', 'Voice playback stopped because the browser reported an error.')
    voiceService.speak(utterance)
  }

  const pause = () => {
    voiceService.pause()
    onStatusChange('paused')
  }

  const stop = () => {
    voiceService.stop()
    onStatusChange('stopped')
  }

  return (
    <div className="voice-panel">
      <div className="voice-status" aria-live="polite"><span data-state={status} />Voice: {status}</div>
      <div className="voice-actions">
        <button className="button button-primary" type="button" onClick={play}>{status === 'paused' ? 'Resume explanation' : 'Play explanation'}</button>
        <button className="button button-secondary" type="button" disabled={status !== 'playing'} onClick={pause}>Pause</button>
        <button className="button button-secondary" type="button" disabled={status !== 'playing' && status !== 'paused'} onClick={stop}>Stop</button>
      </div>
      {(status === 'unavailable' || message) && <p className="voice-message" role="status">{message}</p>}
    </div>
  )
}
