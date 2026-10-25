/// <reference types="node" />
// Les types Node ne sont pas dans tsconfig (le code de l'application tourne dans le navigateur) :
// ce test seul lit un fichier du disque.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Vitest se lance depuis la racine de slide-editor. (Sous jsdom, import.meta.url n'est pas
// une adresse de fichier.)
const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf-8')

describe('index.css : impression', () => {
  it('définit une page 16:9 sans marges', () => {
    expect(css).toContain('@page')
    expect(css).toContain('size: 1280px 720px')
    expect(css).toContain('margin: 0')
  })

  it('force l\'impression des couleurs de fond', () => {
    expect(css).toContain('print-color-adjust: exact')
    expect(css).toContain('-webkit-print-color-adjust: exact')
  })

  it('remet à zéro les marges et le fond de la page à l\'impression', () => {
    expect(css).toContain('@media print')
    expect(css).toMatch(/html,\s*body\s*\{[^}]*background: #fff/)
  })
})
