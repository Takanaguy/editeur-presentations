// Temporaire : retiré quand l'ajout d'éléments existera (étape 7).
// Sert à voir quelque chose à l'écran tant qu'on ne peut pas créer d'éléments via l'interface.
import { createImageElement, createRectElement, createTextElement } from './factories'
import type { Presentation } from './types'

// Image sans ressource externe : un SVG simple encodé dans une URL de données.
const DEMO_IMAGE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270">' +
  '<rect width="480" height="270" fill="#e0f2fe"/>' +
  '<circle cx="360" cy="80" r="40" fill="#facc15"/>' +
  '<polygon points="0,270 140,100 260,270" fill="#0ea5e9"/>' +
  '<polygon points="160,270 320,130 480,270" fill="#0369a1"/>' +
  '</svg>'
const DEMO_IMAGE_SRC = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(DEMO_IMAGE_SVG)}`

export function createDemoPresentation(): Presentation {
  return {
    version: 1,
    title: 'Présentation de démonstration',
    slides: [
      {
        id: 'demo-slide-1',
        elements: [
          createRectElement({ x: 0, y: 0, width: 1280, height: 40, fill: '#1d4ed8' }),
          createTextElement({
            text: 'Diapositive 1 : titre',
            x: 100,
            y: 200,
            width: 1080,
            height: 120,
            fontSize: 72,
          }),
          createTextElement({
            text: 'Diapositive 1 : sous-titre',
            x: 100,
            y: 340,
            width: 1080,
            height: 60,
            fontSize: 32,
            color: '#475569',
          }),
        ],
      },
      {
        id: 'demo-slide-2',
        elements: [
          createTextElement({
            text: 'Diapositive 2 : titre',
            x: 80,
            y: 60,
            width: 1120,
            height: 90,
            fontSize: 56,
          }),
          createRectElement({ x: 80, y: 200, width: 320, height: 240, fill: '#ef4444' }),
          createRectElement({ x: 480, y: 200, width: 320, height: 240, fill: '#22c55e' }),
          createRectElement({ x: 880, y: 200, width: 320, height: 240, fill: '#f59e0b' }),
          createTextElement({
            text: 'Diapositive 2 : texte sur fond coloré',
            x: 80,
            y: 500,
            width: 1120,
            height: 80,
            fontSize: 32,
            color: '#ffffff',
            fill: '#0f172a',
          }),
        ],
      },
      {
        id: 'demo-slide-3',
        elements: [
          createTextElement({
            text: 'Diapositive 3 : titre',
            x: 80,
            y: 60,
            width: 1120,
            height: 90,
            fontSize: 56,
          }),
          createImageElement(DEMO_IMAGE_SRC, {
            x: 80,
            y: 200,
            width: 640,
            height: 360,
            alt: 'Montagnes et soleil',
          }),
          createTextElement({
            text: 'Diapositive 3 : légende',
            x: 780,
            y: 200,
            width: 420,
            height: 100,
            fontSize: 36,
            color: '#0369a1',
          }),
        ],
      },
    ],
  }
}
