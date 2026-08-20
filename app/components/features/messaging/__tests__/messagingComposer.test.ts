import { describe, expect, it } from 'vitest'
import { formatRecordingDuration } from '../messagingComposerUtils'

describe('MessagingComposer helpers', () => {
  it('formate correctement une durée courte', () => {
    expect(formatRecordingDuration(0)).toBe('0:00')
    expect(formatRecordingDuration(9)).toBe('0:09')
    expect(formatRecordingDuration(59)).toBe('0:59')
  })

  it('formate correctement une durée au-delà d’une minute', () => {
    expect(formatRecordingDuration(60)).toBe('1:00')
    expect(formatRecordingDuration(125)).toBe('2:05')
  })
})
