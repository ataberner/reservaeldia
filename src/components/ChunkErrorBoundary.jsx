import React from "react";

function isChunkLoadLike(error) {
  const message = String(error?.message || "");
  return (
    message.includes("ChunkLoadError") ||
    message.includes("Loading chunk") ||
    message.includes("Failed to fetch dynamically imported module") ||
    message.includes("hunkLoadError")
  );
}

class ChunkErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      isChunkError: false,
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
      isChunkError: isChunkLoadLike(error),
    };
  }

  componentDidCatch(error) {
    // Deja rastro en consola para diagnóstico sin romper la UI.
    console.error("Error cargando chunk dinámico:", error);
  }

  handleReload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      isChunkError: false,
    });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const title = this.state.isChunkError
      ? "No se pudo cargar el editor"
      : "Ocurrió un error al cargar el editor";

    const description = this.state.isChunkError
      ? "Parece que el bundle cambió o quedó desactualizado. Recargá para continuar."
      : "Hubo un problema inesperado. Podés intentar nuevamente.";

    return (
      <div className="mx-auto my-6 max-w-xl rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="mt-1 text-sm">{description}</p>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={this.handleReload}
            className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            Recargar página
          </button>
          <button
            type="button"
            onClick={this.handleRetry}
            className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }
}

export default ChunkErrorBoundary;
