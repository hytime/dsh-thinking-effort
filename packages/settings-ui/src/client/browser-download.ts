export type DownloadJson = (filename: string, text: string) => void

/**
 * The one browser side effect the card cannot exercise under jsdom, kept
 * behind a single function so components can take it as an injectable
 * dependency.
 */
export function downloadJson(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
