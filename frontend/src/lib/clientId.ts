/**
 * A random id for this browser tab, sent as `X-Client-Id` on REST requests.
 * The backend stamps it on the WebSocket events those requests cause
 * (`origin`), so a tab can recognise its own actions and not log them twice.
 * It is not a secret and identifies nothing beyond "this tab".
 */

let clientId: string | null = null;

export function getClientId(): string {
  if (clientId === null) {
    // randomUUID only exists in secure contexts (https or localhost).
    const random =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    clientId = `tab-${random}`; // matches the backend's [A-Za-z0-9_-]{1,64}
  }
  return clientId;
}
