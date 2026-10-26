import { MAX_FONT_NAME_LENGTH } from './limits'

export interface BuiltInFont {
  // Nom affiché ET nom de famille : c'est ce qui est stocké dans `fontFamily`.
  name: string
  // Pile CSS : les polices de repli couvrent les systèmes qui n'ont pas la première.
  stack: string
}

// Polices système courantes : rien à télécharger, elles s'affichent immédiatement.
export const BUILT_IN_FONTS: readonly BuiltInFont[] = [
  { name: 'Arial', stack: 'Arial, Helvetica, sans-serif' },
  { name: 'Verdana', stack: 'Verdana, Geneva, sans-serif' },
  { name: 'Trebuchet MS', stack: '"Trebuchet MS", Helvetica, sans-serif' },
  { name: 'Tahoma', stack: 'Tahoma, Geneva, sans-serif' },
  { name: 'Georgia', stack: 'Georgia, "Times New Roman", serif' },
  { name: 'Times New Roman', stack: '"Times New Roman", Times, serif' },
  { name: 'Courier New', stack: '"Courier New", Courier, monospace' },
  { name: 'Impact', stack: 'Impact, "Arial Black", sans-serif' },
]

// Lettres sans accent, chiffres, espace, tiret bas et tiret ; le nom commence ET finit par une
// lettre ou un chiffre. Ni guillemet, ni point virgule, ni parenthèse, ni antislash, ni retour à
// la ligne : un nom de police finit dans une valeur CSS entre guillemets, il ne doit jamais
// pouvoir en sortir (injection CSS). Seul l'espace simple passe (pas \s), et pas deux de suite.
const SAFE_FONT_NAME_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9 _-]*[A-Za-z0-9])?$/

export function isSafeFontName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= MAX_FONT_NAME_LENGTH &&
    SAFE_FONT_NAME_PATTERN.test(value) &&
    !value.includes('  ')
  )
}

export function isBuiltInFont(name: string): boolean {
  return BUILT_IN_FONTS.some((font) => font.name === name)
}

// Valeur CSS `font-family` d'un nom de famille. undefined = ne rien poser : l'élément hérite
// de la police par défaut. Un nom non validé ne sert JAMAIS à fabriquer une valeur CSS.
export function cssFontFamily(fontFamily: string | null): string | undefined {
  if (fontFamily === null || !isSafeFontName(fontFamily)) return undefined
  const builtIn = BUILT_IN_FONTS.find((font) => font.name === fontFamily)
  if (builtIn) return builtIn.stack
  // Police installée chez l'utilisateur (ou, plus tard, ajoutée par fichier) : repli générique.
  return `"${fontFamily}", sans-serif`
}
