type NamedClipboardItem = {
  name: string
}

export type ClipboardObjectMultiplicity = {
  scriptCount: number
  tableCount: number
}

function parseClipboardXml(xml: string) {
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  return document.querySelector('parsererror') ? null : document
}

export function clipboardObjectMultiplicity(xml: string): ClipboardObjectMultiplicity {
  const document = parseClipboardXml(xml)
  if (!document) return { scriptCount: 0, tableCount: 0 }

  return {
    scriptCount: document.querySelectorAll('Script').length,
    tableCount: document.querySelectorAll('BaseTable, Table').length,
  }
}

function nextAvailableTitle(baseTitle: string, existingNames: Iterable<string>) {
  const names = new Set(Array.from(existingNames, (name) => name.trim()))
  if (!names.has(baseTitle)) return baseTitle

  let suffix = 2
  while (names.has(`${baseTitle}${suffix}`)) suffix += 1
  return `${baseTitle}${suffix}`
}

export function clipboardItemName(
  xml: string,
  objectType: string,
  existingItems: Iterable<NamedClipboardItem> = [],
) {
  const document = parseClipboardXml(xml)
  if (document) {
    const tableCount = document.querySelectorAll('BaseTable, Table').length
    if (tableCount > 1) {
      return nextAvailableTitle('複数テーブル', Array.from(existingItems, (item) => item.name))
    }

    const scriptCount = document.querySelectorAll('Script').length
    if (scriptCount > 1) {
      return nextAvailableTitle('複数Script', Array.from(existingItems, (item) => item.name))
    }

    const named = document.querySelector(
      'Script[name], Step[name], BaseTable[name], Table[name], Field[name], Layout[name], CustomFunction[name], Function[name], Theme[name]',
    )
    const name = named?.getAttribute('name')?.trim()
    if (name) return name
  }

  return `${objectType} ${new Date().toLocaleString()}`
}
