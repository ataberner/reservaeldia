import Head from "next/head";

function Error({ statusCode = 404 }) {
  return (
    <>
      <Head>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="mb-4 text-3xl font-bold text-gray-900">
            {statusCode ? `Error ${statusCode}` : "Ha ocurrido un error"}
          </h1>
          <p className="text-gray-600">
            Por favor, intenta recargar la pagina
          </p>
        </div>
      </div>
    </>
  );
}

export default Error;
