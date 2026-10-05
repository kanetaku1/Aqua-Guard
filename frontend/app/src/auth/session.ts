/**
 * Set when an API call returns 401 during a session (12 h inactivity timeout, 02 §7),
 * so Login can explain why the user was signed out (AU-01 "expired" notice).
 */
let sessionExpired = false

export function markSessionExpired() {
  sessionExpired = true
}

export function consumeSessionExpired(): boolean {
  const value = sessionExpired
  sessionExpired = false
  return value
}
