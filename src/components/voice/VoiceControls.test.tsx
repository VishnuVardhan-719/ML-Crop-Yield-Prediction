import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VoiceControls } from './VoiceControls'

class MockUtterance {
  text: string
  lang = ''
  voice: SpeechSynthesisVoice | null = null
  onstart: (() => void) | null = null
  onend: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(text: string) { this.text = text }
}

afterEach(() => vi.unstubAllGlobals())

describe('VoiceControls', () => {
  it('plays with a matching language voice and reports speech state', async () => {
    const user = userEvent.setup()
    const onStatusChange = vi.fn()
    const voice = { lang: 'hi-IN', name: 'Hindi', default: true } as SpeechSynthesisVoice
    const speech = { getVoices: () => [voice], speak: vi.fn((utterance: MockUtterance) => utterance.onstart?.()), cancel: vi.fn(), pause: vi.fn(), resume: vi.fn(), paused: false, speaking: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }
    vi.stubGlobal('SpeechSynthesisUtterance', MockUtterance)
    vi.stubGlobal('speechSynthesis', speech)

    render(<VoiceControls text="व्याख्या" language="hi" status="idle" onStatusChange={onStatusChange} />)
    await user.click(screen.getByRole('button', { name: 'Play explanation' }))

    expect(speech.speak).toHaveBeenCalledOnce()
    expect((speech.speak as ReturnType<typeof vi.fn>).mock.calls[0][0].lang).toBe('hi-IN')
    expect(onStatusChange).toHaveBeenCalledWith('playing')
  })

  it('reports unavailable when no voice matches the selected language', async () => {
    const user = userEvent.setup()
    const onStatusChange = vi.fn()
    const speech = { getVoices: () => [{ lang: 'en-US' }], speak: vi.fn(), cancel: vi.fn(), pause: vi.fn(), resume: vi.fn(), paused: false, speaking: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }
    vi.stubGlobal('SpeechSynthesisUtterance', MockUtterance)
    vi.stubGlobal('speechSynthesis', speech)

    render(<VoiceControls text="వివరణ" language="te" status="idle" onStatusChange={onStatusChange} />)
    await user.click(screen.getByRole('button', { name: 'Play explanation' }))
    expect(speech.speak).not.toHaveBeenCalled()
    expect(onStatusChange).toHaveBeenCalledWith('unavailable', 'No Telugu voice is installed in this browser.')
  })
})
