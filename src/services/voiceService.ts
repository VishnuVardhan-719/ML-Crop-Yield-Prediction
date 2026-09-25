export const voiceService = {
  isSupported: () => typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window,
  getVoices: () => window.speechSynthesis.getVoices(),
  subscribe: (listener: () => void) => {
    const speech = window.speechSynthesis
    speech.addEventListener('voiceschanged', listener)
    return () => {
      speech.removeEventListener('voiceschanged', listener)
      speech.cancel()
    }
  },
  createUtterance: (text: string) => new SpeechSynthesisUtterance(text),
  speak: (utterance: SpeechSynthesisUtterance) => window.speechSynthesis.speak(utterance),
  pause: () => window.speechSynthesis.pause(),
  resume: () => window.speechSynthesis.resume(),
  stop: () => window.speechSynthesis.cancel(),
}
