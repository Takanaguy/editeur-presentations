// Identifiant unique pour les diapositives et les éléments.
export function createId(): string {
  return crypto.randomUUID()
}
