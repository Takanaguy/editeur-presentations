import { useCallback, useEffect, useRef } from 'react'
import { getDocumentFonts, loadFontFace } from '../io/fontLoader'
import type { CustomFont } from '../model/types'

interface Registered {
  src: string
  face: FontFace
}

// Clé d'un échec : le nom ET la source. Un nom sûr ne contient jamais « | ».
const failureKey = (font: CustomFont) => `${font.name}|${font.src}`

// Garde `document.fonts` synchronisé avec les polices de la présentation : ajoute les
// nouvelles (une fois chargées), retire celles qui ont disparu (annulation, import d'une autre
// présentation), remplace celles dont la source a changé. Ne fait rien si le navigateur n'a
// pas l'API FontFace. `onError` reçoit le nom d'une police qui n'a pas pu être chargée, UNE
// seule fois tant que sa source ne change pas.
// Retourne `whenIdle` : une promesse qui se résout quand plus aucun chargement n'est en cours
// (succès ou échec). `document.fonts.ready` ne suffit pas pour l'impression, car il ignore les
// polices que ce hook n'a pas encore ajoutées à `document.fonts`.
export function useDocumentFonts(fonts: CustomFont[], onError?: (name: string) => void) {
  // Ce que ce hook a ajouté à document.fonts, par nom : permet de ne pas recharger une police
  // déjà enregistrée avec la même source, et de savoir quoi retirer.
  const registered = useRef(new Map<string, Registered>())
  // Chargements en cours, par nom. Chaque demande est un objet unique : une réponse qui arrive
  // après que sa demande a été retirée (police supprimée, remplacée, démontage) est ignorée.
  const loading = useRef(new Map<string, { src: string }>())
  // Polices que le navigateur a refusées. Elles restent dans la présentation (rien ne permet
  // de les retirer) : on ne les retente pas et on ne rappelle pas l'erreur tant que la source
  // ne change pas. Conservées après un retrait, pour qu'annuler puis rétablir ne la réaffiche pas.
  const failed = useRef(new Set<string>())
  // Appelants de whenIdle en attente.
  const idleWaiters = useRef<(() => void)[]>([])
  const onErrorRef = useRef(onError)
  useEffect(() => {
    onErrorRef.current = onError
  })

  // À appeler après chaque retrait d'un chargement : réveille ceux qui attendent la fin.
  const releaseIdleWaiters = useCallback(() => {
    if (loading.current.size > 0) return
    const waiters = idleWaiters.current
    idleWaiters.current = []
    for (const resolve of waiters) resolve()
  }, [])

  const whenIdle = useCallback(
    () =>
      loading.current.size === 0
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            idleWaiters.current.push(resolve)
          }),
    [],
  )

  useEffect(() => {
    const set = getDocumentFonts()
    if (set === null) return
    const wanted = new Map(fonts.map((font) => [font.name, font.src]))

    // Retire ce qui a disparu ou dont la source a changé (la nouvelle est chargée plus bas).
    for (const [name, entry] of registered.current) {
      if (wanted.get(name) !== entry.src) {
        set.delete(entry.face)
        registered.current.delete(name)
      }
    }
    // Abandonne les chargements devenus inutiles (course : police retirée avant la fin).
    for (const [name, request] of loading.current) {
      if (wanted.get(name) !== request.src) loading.current.delete(name)
    }

    for (const font of fonts) {
      if (registered.current.has(font.name) || loading.current.has(font.name)) continue
      if (failed.current.has(failureKey(font))) continue
      const request = { src: font.src }
      loading.current.set(font.name, request)
      loadFontFace(font).then(
        (face) => {
          if (loading.current.get(font.name) !== request) return
          loading.current.delete(font.name)
          set.add(face)
          registered.current.set(font.name, { src: font.src, face })
          releaseIdleWaiters()
        },
        () => {
          if (loading.current.get(font.name) !== request) return
          loading.current.delete(font.name)
          failed.current.add(failureKey(font))
          onErrorRef.current?.(font.name)
          releaseIdleWaiters()
        },
      )
    }
    releaseIdleWaiters()
  }, [fonts, releaseIdleWaiters])

  // Au démontage (et au faux démontage de StrictMode), on retire tout ce qu'on a ajouté et on
  // abandonne les chargements : l'effet ci-dessus repart de zéro s'il est relancé.
  useEffect(() => {
    const registeredFonts = registered.current
    const loadingFonts = loading.current
    return () => {
      const set = getDocumentFonts()
      for (const entry of registeredFonts.values()) set?.delete(entry.face)
      registeredFonts.clear()
      loadingFonts.clear()
      releaseIdleWaiters()
    }
  }, [releaseIdleWaiters])

  return { whenIdle }
}
