import '../../styles/globals.css';
import '../../styles/styles.css';
import Head from 'next/head';
import { useEffect } from 'react';

const VIEWPORT_CONTENT = 'width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover';

export default function MyApp({ Component, pageProps }) {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const preventWheelZoom = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.cancelable) {
        event.preventDefault();
      }
    };

    const preventKeyboardZoom = (event) => {
      if (!event.ctrlKey && !event.metaKey) return;

      const key = String(event.key || '').toLowerCase();
      const code = String(event.code || '');
      const isZoomKey =
        key === '+' ||
        key === '=' ||
        key === '-' ||
        key === '_' ||
        key === '0' ||
        code === 'NumpadAdd' ||
        code === 'NumpadSubtract' ||
        code === 'Numpad0';

      if (isZoomKey && event.cancelable) {
        event.preventDefault();
      }
    };

    const supportsTouch =
      ('ontouchstart' in window) ||
      (navigator.maxTouchPoints > 0) ||
      window.matchMedia?.('(pointer: coarse)')?.matches;

    const preventGestureZoom = (event) => {
      if (event.cancelable) event.preventDefault();
    };

    const preventPinchZoom = (event) => {
      if (!event?.touches) return;
      if (event.touches.length > 1 && event.cancelable) {
        event.preventDefault();
      }
    };

    document.addEventListener('wheel', preventWheelZoom, { passive: false });
    document.addEventListener('keydown', preventKeyboardZoom, true);

    if (supportsTouch) {
      document.addEventListener('gesturestart', preventGestureZoom, { passive: false });
      document.addEventListener('gesturechange', preventGestureZoom, { passive: false });
      document.addEventListener('gestureend', preventGestureZoom, { passive: false });
      document.addEventListener('touchmove', preventPinchZoom, { passive: false });
    }

    return () => {
      document.removeEventListener('wheel', preventWheelZoom);
      document.removeEventListener('keydown', preventKeyboardZoom, true);

      if (supportsTouch) {
        document.removeEventListener('gesturestart', preventGestureZoom);
        document.removeEventListener('gesturechange', preventGestureZoom);
        document.removeEventListener('gestureend', preventGestureZoom);
        document.removeEventListener('touchmove', preventPinchZoom);
      }
    };
  }, []);

  return (
    <>
      <Head>
        <meta name="viewport" content={VIEWPORT_CONTENT} />
        <link rel="preconnect" href="https://accounts.google.com" />
        <link rel="preconnect" href="https://www.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://reservaeldia.com.ar" />
        <link rel="dns-prefetch" href="//accounts.google.com" />
        <link rel="dns-prefetch" href="//www.gstatic.com" />
        <link rel="dns-prefetch" href="//reservaeldia.com.ar" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
