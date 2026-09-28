/** True for anything inside the DialKit panel, including its portaled
 *  dropdowns. Dismissable surfaces ignore pointerdowns there so a design
 *  dial can be turned while the surface it styles is open. In a build
 *  without dials the class never exists and this is always false. */
export function isDialKitTarget(node: EventTarget | null): boolean {
  return node instanceof Element && !!node.closest('.dialkit-root');
}
