const MAX_FILE_SIZE = 10 * 1024 * 1024
const FILE_TYPES: Record<string, Set<string>> = {
  '.csv': new Set(['text/csv', 'application/csv', 'application/vnd.ms-excel']),
  '.xlsx': new Set(['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
  '.zip': new Set(['application/zip', 'application/x-zip-compressed']),
}

export function validateDatasetFile(file: File) {
  const extension = Object.keys(FILE_TYPES).find((suffix) => file.name.toLowerCase().endsWith(suffix))
  if (!extension || (file.type && !FILE_TYPES[extension].has(file.type))) {
    return 'Choose a CSV, XLSX, or ZIP dataset package.'
  }
  if (file.size > MAX_FILE_SIZE) return 'The dataset must be 10 MB or smaller.'
  return undefined
}
