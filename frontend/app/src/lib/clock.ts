/**
 * "Now" for the UI. Mock mode and tests pin it to the mock data's clock (VITE_MOCK_NOW,
 * 29 Sep 2026 09:35 WIB) so relative labels such as "Due today" match the prototype.
 */
export function now(): Date {
  const fixed = import.meta.env.VITE_MOCK_NOW
  return fixed ? new Date(fixed) : new Date()
}
