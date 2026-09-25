import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FileDropzone } from './FileDropzone'
import { validateDatasetFile } from './datasetValidation'

describe('FileDropzone', () => {
  it('accepts CSV, XLSX, and ZIP files up to and including 10 MB', () => {
    expect(validateDatasetFile(new File(['a'], 'field.csv', { type: 'text/csv' }))).toBeUndefined()
    expect(validateDatasetFile(new File(['a'], 'field.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))).toBeUndefined()
    expect(validateDatasetFile(new File(['a'], 'field.zip', { type: 'application/zip' }))).toBeUndefined()
    expect(validateDatasetFile(new File([new Uint8Array(10 * 1024 * 1024)], 'field.csv', { type: '' }))).toBeUndefined()
  })

  it('rejects unsupported and oversized files', () => {
    expect(validateDatasetFile(new File(['a'], 'field.txt', { type: 'text/plain' }))).toContain('CSV')
    expect(validateDatasetFile(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'field.csv', { type: 'text/csv' }))).toContain('10 MB')
  })

  it('supports browse, drop, and a separate sample action', async () => {
    const user = userEvent.setup()
    const onFile = vi.fn()
    const onInvalid = vi.fn()
    const onDemo = vi.fn()
    const { container } = render(<FileDropzone status="idle" onFile={onFile} onInvalid={onInvalid} onDemo={onDemo} />)
    const file = new File(['a,b'], 'field.csv', { type: 'text/csv' })

    await user.upload(screen.getByLabelText('Choose dataset file'), file)
    expect(onFile).toHaveBeenCalledWith(file)
    fireEvent.drop(container.querySelector('.dropzone')!, { dataTransfer: { files: [file] } })
    expect(onFile).toHaveBeenCalledTimes(2)
    await user.click(screen.getByRole('button', { name: 'Run demo analysis' }))
    expect(onDemo).toHaveBeenCalledOnce()
  })
})
