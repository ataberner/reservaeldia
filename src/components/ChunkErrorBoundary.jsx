import React from "react";
import { captureEditorIssue } from "@/lib/monitoring/editorIssueReporter";
import {
  isChunkLoadError,
  requestChunkLoadRecoveryReload,
} from "@/domain/runtime/chunkLoadRecovery";

class ChunkErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      isChunkError: false,
      recoveryBlocked: false,
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
      isChunkError: isChunkLoadError(error),
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Error cargando chunk dinamico:", error);
    captureEditorIssue({
      source: "ChunkErrorBoundary",
      error,
      detail: {
        componentStack: errorInfo?.componentStack || null,
      },
      severity: "fatal",
    });
  }

  handleReload = () => {
    const result = requestChunkLoadRecoveryReload();
    if (result?.reloaded !== true) {
      this.setState({
        recoveryBlocked: true,
      });
    }
  };

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      isChunkError: false,
      recoveryBlocked: false,
    });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const title = this.state.isChunkError
      ? "No se pudo cargar el editor"
      : "Ocurrio un error al cargar el editor";

    const description = this.state.recoveryBlocked
      ? "La aplicación ya intentó actualizar esta versión. Cierra esta pestaña y abre el dashboard nuevamente."
      : this.state.isChunkError
      ? "Parece que el bundle cambió o quedó desactualizado. Actualiza para continuar."
      : "Hubo un problema inesperado. Podes intentar nuevamente.";

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
            Actualizar aplicación
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
