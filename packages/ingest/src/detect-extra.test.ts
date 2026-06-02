import { describe, expect, it } from 'vitest'
import { detectKind } from './detect'

describe('detectKind sniffing', () => {
  it('detects rdf and json-bodied feeds with no helpful content type', () => {
    expect(detectKind('', '<rdf:RDF xmlns="http://www.w3.org/1999/02/22-rdf-syntax-ns#">')).toBe(
      'rdf',
    )
    expect(detectKind('', '{"items":[]}')).toBe('jsonfeed') // body starts with {
    expect(detectKind('', 'a jsonfeed.org reference')).toBe('jsonfeed') // bare marker
    expect(detectKind('text/plain', 'just text')).toBe('html') // nothing matched
  })
})
