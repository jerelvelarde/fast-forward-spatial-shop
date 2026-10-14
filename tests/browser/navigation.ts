// Native XR errors and selection feedback are simulated; no device or permission request.
import { mountDesktop } from '../../src/desktop.js';
import { store } from '../../src/store.js';
const get = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const pause = () => new Promise(resolve => setTimeout(resolve, 100));
get<HTMLButtonElement>('#run-tests').onclick = async () => {
  const output = get('#test-results'); output.textContent = '';
  const button = get<HTMLButtonElement>('#run-tests'); button.disabled = true;
  const originalFetch = window.fetch;
  const descriptor = Object.getOwnPropertyDescriptor(navigator, 'xr');
  const rejection = (event: PromiseRejectionEvent) => event.preventDefault();
  window.addEventListener('unhandledrejection', rejection);
  Object.defineProperty(navigator, 'xr', { configurable: true, value: { isSessionSupported: async () => true } });
  const products = ['one', 'two'].map(id => ({ id, title: `Camping pack ${id}`, price: 9900, currency: 'USD' as const, description: 'Synthetic navigation fixture', seller: 'Fixture', imageUrl: '/ui/placeholder.svg', url: 'https://example.com/pack' }));
  window.fetch = async () => Response.json({ products, query: 'camping navigation fixture', message: 'Fixture inventory', tryOnEnabled: false });
  await store.search('camping navigation fixture');
  let entryCalls = 0; let exits = 0;
  const dispose = mountDesktop(get('#desktop'), { enterVR: async () => { entryCalls++; throw new DOMException('Fixture permission denied', 'NotAllowedError'); }, enterAR: async () => { entryCalls++; throw new DOMException('Fixture unavailable', 'NotSupportedError'); }, exitVR() { exits++; document.body.classList.remove('xr-active'); } });
  const check = (condition: unknown, message: string) => { output.textContent += `${condition ? 'PASS' : 'FAIL'} ${message}\n`; };
  try {
    await pause();
    get<HTMLButtonElement>('#enter-vr').click(); await pause();
    check(entryCalls === 1, 'VR click reaches session request');
    check(/permission|declined|allow|denied/i.test(get('#device-status').textContent ?? ''), 'failed VR entry displays permission guidance');
    check(!get<HTMLButtonElement>('#enter-vr').disabled, 'failed VR entry allows retry');
    get<HTMLButtonElement>('#enter-ar').click(); await pause();
    check(/support|unavailable|VR/i.test(get('#device-status').textContent ?? ''), 'failed AR entry offers supported alternative');
    get<HTMLButtonElement>('.product-card[data-product-id="two"]').click(); await pause();
    check(store.getState().selectedId === 'two', 'card selection retains exact variant');
    check(/selected.*Camping pack two/i.test(get('#assistant-message').textContent ?? ''), 'card selection visibly confirms the selected backpack');
    check(!get('.selected-detail').hidden && get('#selected-title').textContent === 'Camping pack two', 'selected backpack shows its next actions');
    document.body.classList.add('xr-active');
    window.dispatchEvent(new Event('trail:try-on')); await pause();
    check(exits === 1 && !document.body.classList.contains('xr-active'), 'headset try-on without a photo exits to photo setup');
    check(get<HTMLDialogElement>('.tryon-dialog').open && !get('.tryon-body').hidden, 'photo setup is visible after the headset handoff');
    check(/photo.*demo token/i.test(get('#dialog-assistant-message').textContent ?? ''), 'photo setup explains what is needed before generation');
    output.textContent += output.textContent.includes('FAIL') ? 'REGRESSION FAILURES FOUND\n' : 'ALL NAVIGATION CHECKS PASSED\n';
  } finally {
    dispose(); window.fetch = originalFetch;
    if (descriptor) Object.defineProperty(navigator, 'xr', descriptor); else Reflect.deleteProperty(navigator, 'xr');
    window.removeEventListener('unhandledrejection', rejection); button.disabled = false;
  }
};
