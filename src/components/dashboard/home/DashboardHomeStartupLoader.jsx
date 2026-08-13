import { Heart } from "lucide-react";
import styles from "./DashboardHomeStartupLoader.module.css";

export default function DashboardHomeStartupLoader({ exiting = false }) {
  return (
    <div
      className={`${styles.root} ${exiting ? styles.exiting : ""}`}
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
          <p className={styles.message}>Preparando tu espacio...</p>
        </div>
      </div>
    </div>
  );
}
