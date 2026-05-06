(() => {
  const script = document.currentScript;
  const scriptSrc = script instanceof HTMLScriptElement ? script.src : '';
  const widgetOrigin = scriptSrc ? new URL(scriptSrc).origin : window.location.origin;

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Spark';
  Object.assign(button.style, {
    position: 'fixed',
    right: '20px',
    bottom: '20px',
    zIndex: '2147483647',
    border: 'none',
    borderRadius: '999px',
    padding: '12px 16px',
    background: '#2563eb',
    color: '#fff',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
  });

  const frame = document.createElement('iframe');
  // Use the script's host, not the host page origin, so embedding works cross-site.
  frame.src = `${widgetOrigin}/embed`;
  frame.title = 'Spark chat widget';
  frame.setAttribute('loading', 'lazy');
  Object.assign(frame.style, {
    position: 'fixed',
    right: '20px',
    bottom: '72px',
    width: '360px',
    maxWidth: 'calc(100vw - 24px)',
    height: '540px',
    maxHeight: 'calc(100vh - 96px)',
    zIndex: '2147483647',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
    background: '#fff',
    display: 'none',
  });

  let open = false;
  function sync() {
    frame.style.display = open ? 'block' : 'none';
    button.textContent = open ? 'Close' : 'Spark';
  }

  button.addEventListener('click', () => {
    open = !open;
    sync();
  });

  document.body.appendChild(button);
  document.body.appendChild(frame);
})();
