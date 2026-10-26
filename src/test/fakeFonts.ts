// Doubles de test pour FontFace et document.fonts : jsdom n'a ni l'un ni l'autre.

export type LoadMode = 'ok' | 'fail' | 'manual'

export class FakeFontFace {
  static env: FakeFontEnv | null = null

  readonly family: string
  readonly source: string
  readonly load = vi.fn(() => {
    const env = FakeFontFace.env
    if (env?.loadMode === 'fail') return Promise.reject(new Error('police refusée'))
    if (env?.loadMode === 'manual') {
      return new Promise<FakeFontFace>((resolve, reject) => {
        this.settle = { resolve: () => resolve(this), reject: () => reject(new Error('police refusée')) }
      })
    }
    return Promise.resolve(this)
  })
  // Rempli en mode « manual » : permet de terminer le chargement quand le test le décide.
  settle: { resolve: () => void; reject: () => void } | null = null

  constructor(family: string, source: string) {
    this.family = family
    this.source = source
    FakeFontFace.env?.faces.push(this)
  }
}

export interface FakeFontEnv {
  loadMode: LoadMode
  // Toutes les FontFace fabriquées depuis l'installation.
  faces: FakeFontFace[]
  // Ce que le test voit comme « document.fonts » : le contenu de l'ensemble et les espions.
  contents: Set<FakeFontFace>
  add: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  setReady: (promise: Promise<unknown>) => void
  restore: () => void
}

// Installe FontFace et document.fonts factices. À appeler dans beforeEach, `restore` dans afterEach.
export function installFakeFonts(): FakeFontEnv {
  let ready: Promise<unknown> = Promise.resolve()
  const contents = new Set<FakeFontFace>()
  const env: FakeFontEnv = {
    loadMode: 'ok',
    faces: [],
    contents,
    add: vi.fn((face: FakeFontFace) => {
      contents.add(face)
    }),
    delete: vi.fn((face: FakeFontFace) => contents.delete(face)),
    setReady: (promise) => {
      ready = promise
    },
    restore: () => {
      vi.unstubAllGlobals()
      Reflect.deleteProperty(document, 'fonts')
      FakeFontFace.env = null
    },
  }
  FakeFontFace.env = env
  vi.stubGlobal('FontFace', FakeFontFace)
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: {
      add: env.add,
      delete: env.delete,
      get ready() {
        return ready
      },
    },
  })
  return env
}
