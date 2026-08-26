import React, { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, any>) => string;
      reset: (widgetId?: string) => void;
      remove?: (widgetId?: string) => void;
    };
  }
}

type Props = {
  action: string;
  onToken: (token: string) => void;
  onExpire?: () => void;
  className?: string;
};

const scriptId = 'afat-turnstile-script';

function loadTurnstileScript() {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  const existing = document.getElementById(scriptId);
  if (existing) {
    return new Promise<void>((resolve) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      setTimeout(resolve, 1200);
    });
  }

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.id = scriptId;
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Turnstile script failed to load.'));
    document.head.appendChild(script);
  });
}

export function TurnstileGate({ action, onToken, onExpire, className = '' }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | undefined>();
  const onTokenRef = useRef(onToken);
  const onExpireRef = useRef(onExpire);
  const [message, setMessage] = useState('');
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';

  useEffect(() => {
    onTokenRef.current = onToken;
    onExpireRef.current = onExpire;
  }, [onExpire, onToken]);

  useEffect(() => {
    let cancelled = false;
    if (!siteKey) {
      setMessage('Turnstile site key is not configured.');
      return;
    }

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        containerRef.current.innerHTML = '';
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action,
          theme: 'dark',
          callback: (token: string) => {
            setMessage('');
            onTokenRef.current(token);
          },
          'expired-callback': () => {
            setMessage('Security check expired. Please retry.');
            onExpireRef.current?.();
          },
          'timeout-callback': () => {
            setMessage('Security check timed out. Please retry.');
            onExpireRef.current?.();
          },
          'error-callback': () => {
            setMessage('Security check failed to load. Check connection and retry.');
            onExpireRef.current?.();
          },
        });
      })
      .catch((error) => setMessage(error.message));

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile?.remove) {
        window.turnstile.remove(widgetIdRef.current);
      }
    };
  }, [action, siteKey]);

  return (
    <div className={className}>
      <div ref={containerRef} />
      {message && <p className="mt-2 text-[10px] font-bold text-amber-200/80">{message}</p>}
    </div>
  );
}
