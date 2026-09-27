const MAX_FILE_SIZE = 10 * 1024 * 1024

// Browsers and operating systems report CSV as text/csv, text/plain, or octet-stream depending on
// registry and editor. The extension decides what we accept; the server re-validates the contents.
const FILE_TYPES: Record<string, Set<string>> = {
  '.csv': new Set(['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain', 'application/octet-stream']),
  '.xlsx': new Set(['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream']),
  '.zip': new Set(['application/zip', 'application/x-zip-compressed', 'application/octet-stream']),
}

export function validateDatasetFile(file: File) {
  const extension = Object.keys(FILE_TYPES).find((suffix) => file.name.toLowerCase().endsWith(suffix))
  if (!extension) return 'Choose a CSV, XLSX, or ZIP dataset package.'
  if (file.type && !FILE_TYPES[extension].has(file.type)) return `That looks like ${file.type || 'an unknown type'}, not ${extension}. Choose a CSV, XLSX, or ZIP dataset package.`
  if (file.size > MAX_FILE_SIZE) return 'The dataset must be 10 MB or smaller.'
  return undefined
}
