import { act, render, renderHook } from '@testing-library/react'
import { StrictMode } from 'react'
import type { CustomFont } from '../model/types'
import { installFakeFonts, type FakeFontEnv } from '../test/fakeFonts'
import { fontSrcOf } from '../test/fixtures'
import { useDocumentFonts } from './useDocumentFonts'

const roboto: CustomFont = { name: 'Roboto', src: fontSrcOf('woff2', 1) }
const fira: CustomFont = { name: 'Fira Code', src: fontSrcOf('ttf', 2) }

let env: FakeFontEnv

beforeEach(() => {
  env = installFakeFonts()
})

afterEach(() => {
  env.restore()
})

// Laisse passer les promesses en attente (chargements simulés).
async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function setup(initial: CustomFont[], onError?: (name: string) => void) {
  return renderHook(({ fonts }) => useDocumentFonts(fonts, onError), {
    initialProps: { fonts: initial },
  })
}

describe('useDocumentFonts', () => {
  it('charge puis ajoute à document.fonts chaque police de la présentation', async () => {
    setup([roboto, fira])
    await flush()

    expect(env.faces.map((face) => face.family)).toEqual(['Roboto', 'Fira Code'])
    expect(env.faces[0]?.source).toBe(`url("${roboto.src}")`)
    expect(env.add).toHaveBeenCalledTimes(2)
    expect(env.contents.size).toBe(2)
  })

  it("n'ajoute la police qu'une fois le chargement terminé", async () => {
    env.loadMode = 'manual'
    setup([roboto])
    await flush()
    expect(env.add).not.toHaveBeenCalled()

    env.faces[0]?.settle?.resolve()
    await flush()

    expect(env.add).toHaveBeenCalledTimes(1)
  })

  it('sans police, ne fait rien', async () => {
    setup([])
    await flush()

    expect(env.faces).toHaveLength(0)
    expect(env.add).not.toHaveBeenCalled()
    expect(env.delete).not.toHaveBeenCalled()
  })

  it('ajoute une police arrivée plus tard sans recharger les autres', async () => {
    const { rerender } = setup([roboto])
    await flush()

    rerender({ fonts: [roboto, fira] })
    await flush()

    expect(env.faces).toHaveLength(2)
    expect(env.add).toHaveBeenCalledTimes(2)
  })

  it('retire de document.fonts une police qui a disparu', async () => {
    const { rerender } = setup([roboto, fira])
    await flush()
    const robotoFace = env.faces[0]

    rerender({ fonts: [fira] })
    await flush()

    expect(env.delete).toHaveBeenCalledTimes(1)
    expect(env.delete).toHaveBeenCalledWith(robotoFace)
    expect([...env.contents].map((face) => face.family)).toEqual(['Fira Code'])
  })

  it('retire tout quand la liste devient vide (annulation, autre présentation)', async () => {
    const { rerender } = setup([roboto, fira])
    await flush()

    rerender({ fonts: [] })
    await flush()

    expect(env.contents.size).toBe(0)
  })

  it('ne recharge pas une police déjà enregistrée avec la même source', async () => {
    const { rerender } = setup([roboto])
    await flush()

    // Nouvelle liste, nouvel objet, même nom et même source.
    rerender({ fonts: [{ ...roboto }] })
    rerender({ fonts: [{ ...roboto }, fira] })
    await flush()

    expect(env.faces.filter((face) => face.family === 'Roboto')).toHaveLength(1)
    expect(env.delete).not.toHaveBeenCalled()
  })

  it('remplace une police dont la source a changé', async () => {
    const { rerender } = setup([roboto])
    await flush()
    const oldFace = env.faces[0]
    const changed = { name: 'Roboto', src: fontSrcOf('otf', 5) }

    rerender({ fonts: [changed] })
    await flush()

    expect(env.delete).toHaveBeenCalledWith(oldFace)
    expect(env.faces).toHaveLength(2)
    expect(env.faces[1]?.source).toBe(`url("${changed.src}")`)
    expect([...env.contents]).toEqual([env.faces[1]])
  })

  it('course : une police retirée avant la fin de son chargement ne sera jamais ajoutée', async () => {
    env.loadMode = 'manual'
    const { rerender } = setup([roboto])
    await flush()

    rerender({ fonts: [] })
    await flush()
    env.faces[0]?.settle?.resolve()
    await flush()

    expect(env.add).not.toHaveBeenCalled()
    expect(env.contents.size).toBe(0)
  })

  it('course : une source remplacée pendant le chargement ignore la réponse périmée', async () => {
    env.loadMode = 'manual'
    const { rerender } = setup([roboto])
    await flush()
    const changed = { name: 'Roboto', src: fontSrcOf('otf', 5) }

    rerender({ fonts: [changed] })
    await flush()
    // La première réponse arrive après la seconde demande : elle est ignorée.
    env.faces[0]?.settle?.resolve()
    await flush()
    expect(env.add).not.toHaveBeenCalled()
    env.faces[1]?.settle?.resolve()
    await flush()

    expect(env.add).toHaveBeenCalledTimes(1)
    expect([...env.contents]).toEqual([env.faces[1]])
  })

  it("course : une erreur de chargement d'une police retirée entre-temps n'est pas signalée", async () => {
    env.loadMode = 'manual'
    const onError = vi.fn()
    const { rerender } = setup([roboto], onError)
    await flush()

    rerender({ fonts: [] })
    env.faces[0]?.settle?.reject()
    await flush()

    expect(onError).not.toHaveBeenCalled()
  })

  it("appelle onError avec le nom quand le chargement échoue, sans rien ajouter", async () => {
    env.loadMode = 'fail'
    const onError = vi.fn()
    setup([roboto, fira], onError)
    await flush()

    expect(onError).toHaveBeenCalledTimes(2)
    expect(onError).toHaveBeenCalledWith('Roboto')
    expect(onError).toHaveBeenCalledWith('Fira Code')
    expect(env.add).not.toHaveBeenCalled()
  })

  it('ne réessaie pas une police qui a échoué tant que la liste ne change pas', async () => {
    env.loadMode = 'fail'
    const onError = vi.fn()
    const fonts = [roboto]
    const { rerender } = setup(fonts, onError)
    await flush()

    rerender({ fonts })
    await flush()

    expect(env.faces).toHaveLength(1)
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('utilise le dernier onError fourni', async () => {
    env.loadMode = 'manual'
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(
      ({ fonts, onError }) => useDocumentFonts(fonts, onError),
      { initialProps: { fonts: [roboto], onError: first } },
    )
    await flush()

    rerender({ fonts: [roboto], onError: second })
    env.faces[0]?.settle?.reject()
    await flush()

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith('Roboto')
  })

  it('une police qui échoue ne gêne pas les autres', async () => {
    const onError = vi.fn()
    env.loadMode = 'manual'
    setup([roboto, fira], onError)
    await flush()

    env.faces[0]?.settle?.reject()
    env.faces[1]?.settle?.resolve()
    await flush()

    expect(onError).toHaveBeenCalledWith('Roboto')
    expect([...env.contents].map((face) => face.family)).toEqual(['Fira Code'])
  })

  it("nettoie au démontage : retire tout ce qu'il a ajouté", async () => {
    const { unmount } = setup([roboto, fira])
    await flush()
    expect(env.contents.size).toBe(2)

    unmount()

    expect(env.contents.size).toBe(0)
    expect(env.delete).toHaveBeenCalledTimes(2)
  })

  it('un chargement encore en cours au démontage ne sera jamais ajouté', async () => {
    env.loadMode = 'manual'
    const { unmount } = setup([roboto])
    await flush()

    unmount()
    env.faces[0]?.settle?.resolve()
    await flush()

    expect(env.add).not.toHaveBeenCalled()
  })

  it('est inoffensif sans FontFace ni document.fonts', async () => {
    env.restore()
    const onError = vi.fn()

    const { rerender, unmount } = setup([roboto], onError)
    await flush()
    rerender({ fonts: [] })
    unmount()

    expect(onError).not.toHaveBeenCalled()
  })

  it("est inoffensif avec document.fonts mais sans FontFace : signale l'échec", async () => {
    vi.unstubAllGlobals()
    const onError = vi.fn()

    setup([roboto], onError)
    await flush()

    expect(onError).toHaveBeenCalledWith('Roboto')
    expect(env.add).not.toHaveBeenCalled()
  })

  describe('échecs mémorisés', () => {
    it("un échec n'est notifié qu'une fois malgré plusieurs ajouts, annulations et rétablissements", async () => {
      env.loadMode = 'fail'
      const onError = vi.fn()
      const { rerender } = setup([roboto], onError)
      await flush()
      expect(onError).toHaveBeenCalledTimes(1)

      // Ajout d'une autre police (qui échoue aussi), annulation, rétablissement, nouvel ajout.
      rerender({ fonts: [roboto, fira] })
      await flush()
      rerender({ fonts: [roboto] })
      await flush()
      rerender({ fonts: [{ ...roboto }, { ...fira }] })
      await flush()
      rerender({ fonts: [] })
      await flush()
      rerender({ fonts: [{ ...roboto }] })
      await flush()

      expect(onError.mock.calls.filter(([name]) => name === 'Roboto')).toHaveLength(1)
      expect(onError.mock.calls.filter(([name]) => name === 'Fira Code')).toHaveLength(1)
      expect(env.faces.filter((face) => face.family === 'Roboto')).toHaveLength(1)
      expect(env.faces.filter((face) => face.family === 'Fira Code')).toHaveLength(1)
    })

    it('une source changée est retentée (et notifiée de nouveau si elle échoue encore)', async () => {
      env.loadMode = 'fail'
      const onError = vi.fn()
      const { rerender } = setup([roboto], onError)
      await flush()

      rerender({ fonts: [{ name: 'Roboto', src: fontSrcOf('otf', 7) }] })
      await flush()

      expect(env.faces.filter((face) => face.family === 'Roboto')).toHaveLength(2)
      expect(onError).toHaveBeenCalledTimes(2)
    })

    it('une source changée qui charge bien est enregistrée', async () => {
      env.loadMode = 'fail'
      const { rerender } = setup([roboto])
      await flush()
      env.loadMode = 'ok'

      rerender({ fonts: [{ name: 'Roboto', src: fontSrcOf('otf', 7) }] })
      await flush()

      expect(env.contents.size).toBe(1)
    })
  })

  describe('whenIdle', () => {
    const idle = (view: { result: { current: { whenIdle: () => Promise<void> } } }) => {
      let done = false
      void view.result.current.whenIdle().then(() => {
        done = true
      })
      return () => done
    }

    it('se résout tout de suite quand rien ne charge', async () => {
      const view = setup([])
      await flush()

      await expect(view.result.current.whenIdle()).resolves.toBeUndefined()
    })

    it('attend la fin de tous les chargements en cours', async () => {
      env.loadMode = 'manual'
      const view = setup([roboto, fira])
      await flush()
      const isDone = idle(view)
      await flush()
      expect(isDone()).toBe(false)

      env.faces[0]?.settle?.resolve()
      await flush()
      expect(isDone()).toBe(false)
      env.faces[1]?.settle?.resolve()
      await flush()

      expect(isDone()).toBe(true)
      expect(env.add).toHaveBeenCalledTimes(2)
    })

    it('se résout aussi quand un chargement échoue', async () => {
      env.loadMode = 'manual'
      const view = setup([roboto])
      await flush()
      const isDone = idle(view)

      env.faces[0]?.settle?.reject()
      await flush()

      expect(isDone()).toBe(true)
    })

    it('se résout quand le chargement attendu est abandonné (police retirée)', async () => {
      env.loadMode = 'manual'
      const view = setup([roboto])
      await flush()
      const isDone = idle(view)

      view.rerender({ fonts: [] })
      await flush()

      expect(isDone()).toBe(true)
    })

    it('se résout au démontage', async () => {
      env.loadMode = 'manual'
      const view = setup([roboto])
      await flush()
      const isDone = idle(view)

      view.unmount()
      await flush()

      expect(isDone()).toBe(true)
    })

    it('plusieurs appelants sont tous réveillés', async () => {
      env.loadMode = 'manual'
      const view = setup([roboto])
      await flush()
      const first = idle(view)
      const second = idle(view)

      env.faces[0]?.settle?.resolve()
      await flush()

      expect(first()).toBe(true)
      expect(second()).toBe(true)
    })

    it('se résout tout de suite sans FontFace ni document.fonts', async () => {
      env.restore()
      const view = setup([roboto])
      await flush()

      await expect(view.result.current.whenIdle()).resolves.toBeUndefined()
    })

    it("la fonction est stable d'un rendu à l'autre", async () => {
      const view = setup([roboto])
      await flush()
      const before = view.result.current.whenIdle

      view.rerender({ fonts: [roboto, fira] })
      await flush()

      expect(view.result.current.whenIdle).toBe(before)
    })
  })

  describe('sous StrictMode', () => {
    // Composant plutôt que renderHook : c'est le rendu direct qui rejoue les effets (annulés puis
    // relancés) comme en développement.
    function Harness({ fonts }: { fonts: CustomFont[] }) {
      useDocumentFonts(fonts)
      return null
    }
    const renderStrict = (fonts: CustomFont[]) =>
      render(
        <StrictMode>
          <Harness fonts={fonts} />
        </StrictMode>,
      )

    it("l'effet annulé puis relancé n'enregistre chaque police qu'une fois", async () => {
      renderStrict([roboto, fira])
      await flush()

      expect([...env.contents].map((face) => face.family).sort()).toEqual(['Fira Code', 'Roboto'])
      expect(env.add).toHaveBeenCalledTimes(2)
    })

    it('le chargement lancé par le premier passage est ignoré, seul le second compte', async () => {
      env.loadMode = 'manual'
      renderStrict([roboto])
      await flush()
      expect(env.faces).toHaveLength(2)

      // Réponse du premier passage (périmée), puis du second.
      env.faces[0]?.settle?.resolve()
      await flush()
      expect(env.add).not.toHaveBeenCalled()
      env.faces[1]?.settle?.resolve()
      await flush()

      expect([...env.contents]).toEqual([env.faces[1]])
    })

    it('le démontage retire tout', async () => {
      const { unmount } = renderStrict([roboto])
      await flush()

      unmount()

      expect(env.contents.size).toBe(0)
    })
  })
})
