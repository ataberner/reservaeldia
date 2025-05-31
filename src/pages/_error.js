function Error({ statusCode }) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          {statusCode
            ? `Error ${statusCode}`
            : 'Ha ocurrido un error'}
        </h1>
        <p className="text-gray-600">
          Por favor, intenta recargar la página
        </p>
      </div>
    </div>
  );
}

Error.getInitialProps = ({ res, err }) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  return { statusCode };
};

export default Error; 