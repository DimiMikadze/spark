(() => {
  const script = document.currentScript;
  const scriptSrc = script instanceof HTMLScriptElement ? script.src : '';
  const widgetOrigin = scriptSrc ? new URL(scriptSrc).origin : window.location.origin;
  const mode = (script && script.getAttribute('data-mode')) || 'auto';
  const embedUrl = `${widgetOrigin}/embed`;

  // Body scroll lock that survives iOS Safari (matches the host site's BotpressChat trick).
  let savedScrollY = 0;
  let scrollLocked = false;
  function lockScroll() {
    if (scrollLocked) return;
    scrollLocked = true;
    savedScrollY = window.scrollY;
    Object.assign(document.body.style, {
      position: 'fixed',
      top: `-${savedScrollY}px`,
      left: '0',
      right: '0',
      width: '100%',
    });
  }
  function unlockScroll() {
    if (!scrollLocked) return;
    scrollLocked = false;
    Object.assign(document.body.style, {
      position: '',
      top: '',
      left: '',
      right: '',
      width: '',
    });
    window.scrollTo(0, savedScrollY);
  }

  if (mode === 'manual') {
    // Headless mode: no auto-button. Host site renders its own trigger and calls window.Spark.open().
    let overlayEl = null;
    let isOpen = false;

    function buildOverlay() {
      const isMobile = window.matchMedia('(max-width: 639px)').matches;

      const root = document.createElement('div');
      Object.assign(root.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '2147483647',
        display: 'flex',
        justifyContent: 'center',
        background: isMobile ? '#000' : 'rgba(0,0,0,0.9)',
        paddingTop: isMobile ? '0' : '80px',
      });

      const panel = document.createElement('div');
      Object.assign(panel.style, {
        height: isMobile ? '100%' : '620px',
        width: isMobile ? '100%' : '460px',
        maxWidth: '100%',
        background: '#1a1a1a',
        borderRadius: isMobile ? '0' : '16px',
        overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      });

      const frame = document.createElement('iframe');
      frame.src = embedUrl;
      frame.title = 'Spark chat';
      frame.setAttribute('loading', 'lazy');
      Object.assign(frame.style, {
        width: '100%',
        height: '100%',
        border: '0',
        background: '#1a1a1a',
        display: 'block',
      });

      panel.appendChild(frame);
      panel.addEventListener('click', (e) => e.stopPropagation());
      root.appendChild(panel);

      // Close button only on mobile — desktop closes via backdrop click.
      if (isMobile) {
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.setAttribute('aria-label', 'Close chat');
        closeBtn.innerHTML =
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        Object.assign(closeBtn.style, {
          position: 'fixed',
          right: '12px',
          top: '8px',
          zIndex: '10',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '36px',
          width: '36px',
          borderRadius: '999px',
          background: 'rgba(255,255,255,0.1)',
          color: '#fff',
          border: '0',
          cursor: 'pointer',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
        });
        closeBtn.addEventListener('click', close);
        root.appendChild(closeBtn);
      }

      root.addEventListener('click', close);
      return root;
    }

    function onKeydown(e) {
      if (e.key === 'Escape') close();
    }

    function open() {
      if (isOpen) return;
      isOpen = true;
      overlayEl = buildOverlay();
      document.body.appendChild(overlayEl);
      lockScroll();
      document.addEventListener('keydown', onKeydown);
    }

    function close() {
      if (!isOpen) return;
      isOpen = false;
      if (overlayEl) {
        overlayEl.remove();
        overlayEl = null;
      }
      unlockScroll();
      document.removeEventListener('keydown', onKeydown);
    }

    window.Spark = { open, close };
    return;
  }

  // Auto mode (default): drop-in corner button + corner panel for sites that want zero setup.
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
  frame.src = embedUrl;
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
