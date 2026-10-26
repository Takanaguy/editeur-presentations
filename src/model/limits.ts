// Limites partagées entre l'éditeur et l'import de fichier. Elles sont appliquées aux
// DEUX endroits : si l'éditeur permettait plus que l'import n'accepte, il pourrait
// produire un fichier que lui-même refuserait de relire, et l'utilisateur perdrait son travail.
export const MAX_SLIDES = 200
export const MAX_ELEMENTS_PER_SLIDE = 500
export const MAX_TEXT_LENGTH = 10000
export const MAX_ALT_LENGTH = 500
export const MAX_TITLE_LENGTH = 200
// Un nom de famille de police finit dans une valeur CSS et dans le fichier PowerPoint : on le borne.
export const MAX_FONT_NAME_LENGTH = 64
// Caractères cumulés des `src` d'images de TOUTE la présentation. Le fichier exporté est
// limité à 25 Mo : on garde 10 Mo de marge pour le reste du JSON (textes, géométrie, ids).
export const MAX_TOTAL_IMAGE_SRC_LENGTH = 15 * 1024 * 1024
// Polices ajoutées par fichier. Une police de 2 Mo fait environ 2,8 millions de caractères une
// fois encodée en data URL base64 (4/3 de la taille) : 3 Mo de caractères laissent de la marge.
export const MAX_FONTS = 10
export const MAX_FONT_FILE_SIZE = 2 * 1024 * 1024
export const MAX_FONT_SRC_LENGTH = 3 * 1024 * 1024
// Cumul des polices : avec les images (15 Mo), on reste sous la limite de fichier de 25 Mo.
export const MAX_TOTAL_FONT_SRC_LENGTH = 8 * 1024 * 1024
// Les mêmes limites en Mo, pour les messages : dérivées des constantes, jamais écrites en dur.
const MB = 1024 * 1024
export const MAX_FONT_FILE_MB = MAX_FONT_FILE_SIZE / MB
export const MAX_FONT_SRC_MB = MAX_FONT_SRC_LENGTH / MB
export const MAX_TOTAL_FONT_MB = MAX_TOTAL_FONT_SRC_LENGTH / MB
