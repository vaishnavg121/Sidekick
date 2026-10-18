// Local UI signals never expose a shadow-root handle or browser data to a page.
export const pageControls = new EventTarget();
export function focusAddress() {
  pageControls.dispatchEvent(new Event('address'));
}
