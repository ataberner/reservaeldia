import { Heart } from "lucide-react";
import styles from "./DashboardHomeStartupLoader.module.css";

export default function DashboardHomeStartupLoader({
  exiting = false,
  fullScreen = false,
  reconnecting = false,
}) {
  return (
    <div
      className={`${styles.root} ${fullScreen ? styles.fullScreen : ""} ${exiting ? styles.exiting : ""} ${reconnecting ? styles.waiting : ""}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-hidden={exiting ? "true" : undefined}
    >
      <div className={styles.viewport}>
        <div className={styles.content}>
          <div className={styles.stage} aria-hidden="true">
            <span className={styles.halo} />
            <span className={styles.ring} />
            <Heart className={styles.heart} />
          </div>
          <p className={styles.message}>
            {reconnecting ? "Restableciendo la conexión..." : "Preparando tu espacio..."}
          </p>
          {reconnecting && (
            <p className={styles.connectionHint}>Continuaremos automáticamente.</p>
          )}
        </div>
      </div>
    </div>
  );
}
