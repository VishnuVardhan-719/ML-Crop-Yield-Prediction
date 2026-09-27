import { describe, expect, it } from 'vitest'
import { validateDatasetFile } from './datasetValidation'

const file = (name: string, type: string, size = 1024) => {
  const blob = new File(['x'], name, { type })
  Object.defineProperty(blob, 'size', { value: size })
  return blob
}

describe('validateDatasetFile', () => {
  it('accepts a CSV however the operating system reports its MIME type', () => {
    // Windows and some editors report CSV as text/plain or octet-stream; all of these are valid uploads.
    for (const type of ['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain', 'application/octet-stream', '']) {
      expect(validateDatasetFile(file('field.csv', type)), type).toBeUndefined()
    }
  })

  it('accepts XLSX and ZIP', () => {
    expect(validateDatasetFile(file('field.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))).toBeUndefined()
    expect(validateDatasetFile(file('field.zip', 'application/zip'))).toBeUndefined()
  })

  it('rejects an unsupported extension', () => {
    expect(validateDatasetFile(file('field.json', 'application/json'))).toBe('Choose a CSV, XLSX, or ZIP dataset package.')
  })

  it('rejects a mismatched MIME type with a message naming the mismatch', () => {
    const message = validateDatasetFile(file('field.csv', 'image/png'))
    expect(message).toMatch(/not \.csv/)
  })

  it('rejects a file over the 10 MB limit', () => {
    expect(validateDatasetFile(file('field.csv', 'text/csv', 10 * 1024 * 1024 + 1))).toBe('The dataset must be 10 MB or smaller.')
  })
})
