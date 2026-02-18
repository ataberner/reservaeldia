import '../../styles/globals.css';
import '../../styles/styles.css';
import Head from 'next/head';

export default function MyApp({ Component, pageProps }) {
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
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

