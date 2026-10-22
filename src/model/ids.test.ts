import { createId } from './ids'

describe('createId', () => {
  it('renvoie une chaîne non vide', () => {
    const id = createId()
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })

  it('renvoie des ids uniques sur 1000 appels', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => createId()))
    expect(ids.size).toBe(1000)
  })
})
