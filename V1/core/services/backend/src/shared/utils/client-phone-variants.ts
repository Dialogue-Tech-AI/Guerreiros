/**
 * Normaliza variações do mesmo cliente (JID Baileys, só dígitos, etc.)
 * para buscas que não devem depender da linha WhatsApp cadastrada.
 */
export function buildClientPhoneVariants(raw: string): string[] {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return [];
  const digits = trimmed.replace(/\D/g, '');
  const variants = new Set<string>();
  variants.add(trimmed);
  if (digits.length >= 10 && digits.length <= 15) {
    variants.add(digits);
    variants.add(`${digits}@s.whatsapp.net`);
  }
  return [...variants];
}

/** Verifica se dois valores guardados/recebidos referem-se ao mesmo cliente. */
export function phonesRepresentSameClient(a: string, b: string): boolean {
  const setA = new Set(buildClientPhoneVariants(a));
  return buildClientPhoneVariants(b).some((v) => setA.has(v));
}
