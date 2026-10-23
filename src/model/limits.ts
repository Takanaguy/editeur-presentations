// Limites partagées entre l'éditeur et l'import de fichier. Elles sont appliquées aux
// DEUX endroits : si l'éditeur permettait plus que l'import n'accepte, il pourrait
// produire un fichier que lui-même refuserait de relire, et l'utilisateur perdrait son travail.
export const MAX_SLIDES = 200
export const MAX_ELEMENTS_PER_SLIDE = 500
export const MAX_TEXT_LENGTH = 10000
export const MAX_ALT_LENGTH = 500
export const MAX_TITLE_LENGTH = 200
// Caractères cumulés des `src` d'images de TOUTE la présentation. Le fichier exporté est
// limité à 25 Mo : on garde 10 Mo de marge pour le reste du JSON (textes, géométrie, ids).
export const MAX_TOTAL_IMAGE_SRC_LENGTH = 15 * 1024 * 1024
