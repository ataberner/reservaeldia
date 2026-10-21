import { LocateFixed, Minus, Plus } from "lucide-react";
import styles from "./VenuesLanding.module.css";

const PREVIEW_ACTION_TITLE = "Disponible en una próxima etapa";

// Original, illustrative geography only. No map service, coordinates or requests.
export default function VenuesMap({ venues }) {
  return (
    <figure className={styles.mapFigure} aria-label="Mapa ilustrativo de lugares de ejemplo en Buenos Aires">
      <div className={styles.mapCanvas}>
        <svg className={styles.mapDrawing} viewBox="0 0 640 650" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <pattern id="venues-map-streets" width="31" height="31" patternUnits="userSpaceOnUse" patternTransform="rotate(-34)">
              <path d="M0 0H31M0 0V31M15.5 0V31" fill="none" stroke="#fff" strokeWidth="0.8" opacity="0.8" />
            </pattern>
            <clipPath id="venues-map-land">
              <path d="M0 0H407L419 43 405 81 428 116 415 158 447 202 448 246 465 290 481 321 495 368 523 411 535 448 564 488 580 534 640 565V650H0Z" />
            </clipPath>
          </defs>

          <rect width="640" height="650" fill="#acd9ed" />
          <g clipPath="url(#venues-map-land)">
            <rect width="640" height="650" fill="#eeedeb" />
            <g fill="#d6e8d2">
              <path d="M0 0H123L115 28 134 48 102 75 96 105 67 125 57 95 28 114 0 86Z" />
              <path d="M157 0H287L268 34 285 62 251 91 231 68 220 110 190 89 177 49 148 33Z" />
              <path d="M343 0H426V174L401 163 384 128 359 143 337 114 349 83 325 62Z" />
              <path d="M59 157L95 130 119 153 145 141 158 178 134 207 104 202 84 227 58 197Z" />
              <path d="M238 131L268 108 294 130 323 124 345 156 321 185 335 211 311 233 282 199 252 202 224 167Z" />
              <path d="M366 190L401 177 421 203 447 218 462 271 439 284 421 261 398 276 388 238Z" />
              <path d="M0 283L33 265 59 294 77 284 102 320 81 347 52 331 28 352 0 341Z" />
              <path d="M152 279L183 254 218 273 240 310 221 334 234 371 203 395 180 371 164 340 138 315Z" />
              <path d="M303 326L338 308 369 329 382 367 362 388 379 420 353 461 328 442 300 458 278 424 296 389Z" />
              <path d="M63 430L95 414 121 440 109 471 131 492 116 526 87 515 66 483 42 466Z" />
              <path d="M204 478L239 454 267 481 285 515 260 542 274 577 242 600 214 566 194 538Z" />
              <path d="M411 481L438 460 465 480 476 514 452 535 423 522Z" />
              <path d="M0 575L36 552 58 578 86 568 109 603 90 650H0Z" />
            </g>
            <rect width="640" height="650" fill="url(#venues-map-streets)" />
            <g fill="none" stroke="#fff" strokeWidth="2" opacity="0.95">
              <path d="M-30 35L116 136 202 223 324 306 411 415 526 508 610 650" />
              <path d="M45-25L134 90 248 187 340 285 409 373 476 467 556 575" />
              <path d="M128-20L219 89 286 163 372 247 467 328" />
              <path d="M-15 160L100 258 190 348 296 430 375 533 465 650" />
              <path d="M-15 373L92 445 165 535 284 650" />
              <path d="M-20 271L91 191 202 115 343 48 450 22" />
              <path d="M-25 422L113 321 232 248 345 176 427 119" />
              <path d="M-25 559L104 472 227 369 341 294 463 239" />
              <path d="M68 650L166 552 272 479 390 389 500 335" />
              <path d="M221 650L326 566 435 498 563 433" />
              <path d="M386 650L476 586 597 522" />
            </g>
            <g fill="none" stroke="#c9ccd2" strokeWidth="3">
              <path d="M-20 218C79 264 131 292 211 336S319 390 384 401 490 438 507 502 552 560 664 589" />
              <path d="M138-15C165 65 210 98 246 157S278 247 316 303 348 370 376 404" />
              <path d="M414 650C438 594 460 554 507 502S569 467 615 489" />
            </g>
            <g fill="none" stroke="#f3d994" strokeWidth="1.8">
              <path d="M-15 72L82 164 125 246 209 339 274 453 358 570 429 650" />
              <path d="M0 382L102 469 193 553 261 650" />
              <path d="M128 650L209 560 278 488 376 404 409 319 451 242" />
              <path d="M292 650L378 549 457 522 507 502" />
            </g>
          </g>

          <g fill="#d5e7ca" stroke="#bfdcce" strokeWidth="1">
            <path d="M423 0L446 24 436 59 453 84 442 112 421 79 431 43Z" />
            <path d="M459 9L483 39 471 69 492 101 480 131 461 102 469 74 448 42Z" />
            <path d="M445 135L464 154 457 183 480 210 471 237 448 213 438 177Z" />
            <path d="M489 145L512 166 501 194 517 226 500 254 484 226 490 199 475 173Z" />
            <path d="M469 272L490 286 483 311 506 338 494 360 478 337 467 306Z" />
            <path d="M513 276L528 302 518 327 536 356 524 378 511 354 505 318Z" />
            <path d="M502 386L523 399 519 429 539 453 527 473 512 446Z" />
          </g>
          <path d="M338 0C366 50 362 92 388 138S418 211 441 255 454 314 479 359" fill="none" stroke="#b3dce5" strokeWidth="5" />
          <path d="M331 287C355 286 357 313 384 319S416 339 438 347" fill="none" stroke="#b3dce5" strokeWidth="2" />

          <g className={styles.mapPlaceLabels}>
            <text x="31" y="236">Pilar</text>
            <text x="196" y="106">Escobar</text>
            <text x="408" y="198">Tigre</text>
            <text x="359" y="352">San Isidro</text>
            <text x="63" y="393" className={styles.mapSecondaryPlace}>José C. Paz</text>
            <text x="80" y="445" className={styles.mapSecondaryPlace}>San Miguel</text>
            <text x="448" y="466" className={styles.mapSecondaryPlace}>Vicente López</text>
            <text x="143" y="522" className={styles.mapSecondaryPlace}>Morón</text>
            <text x="473" y="602" className={styles.mapCapital}>Buenos Aires</text>
            <text x="548" y="307" className={styles.mapWaterLabel}>Río de la Plata</text>
            <text x="265" y="253" transform="rotate(36 265 253)" className={styles.mapWaterLabel}>Río Luján</text>
          </g>
          <g className={styles.mapRoadLabels}>
            <rect x="106" y="269" width="20" height="22" rx="5" /><text x="116" y="284">9</text>
            <rect x="214" y="373" width="20" height="22" rx="5" /><text x="224" y="388">8</text>
            <rect x="317" y="404" width="25" height="22" rx="4" /><text x="329.5" y="419">197</text>
            <rect x="351" y="545" width="25" height="22" rx="4" /><text x="363.5" y="560">202</text>
          </g>
        </svg>

        <button className={styles.mapSearchButton} type="button" disabled title={PREVIEW_ACTION_TITLE}>
          <LocateFixed size={19} aria-hidden="true" /> Buscar en esta zona
        </button>
        <ul className={styles.mapPins} aria-label="Lugares ilustrados">
          {venues.map((venue, index) => (
            <li key={venue.name} className={`${styles.mapPin} ${styles[venue.mapClass]}`}>
              <span className={`${styles.mapPinLabel} ${index === 0 ? styles.mapPinFeatured : ""}`}>{venue.name}</span>
              <span className={styles.mapPinDot} aria-hidden="true" />
            </li>
          ))}
        </ul>
        <div className={styles.mapZoom} role="group" aria-label="Vista previa de controles del mapa">
          <button type="button" disabled title={PREVIEW_ACTION_TITLE} aria-label="Acercar mapa"><Plus size={19} aria-hidden="true" /></button>
          <button type="button" disabled title={PREVIEW_ACTION_TITLE} aria-label="Alejar mapa"><Minus size={19} aria-hidden="true" /></button>
        </div>
      </div>
      <figcaption className={styles.mapCaption}>Vista conceptual · Lugares de ejemplo · Mapa ilustrativo</figcaption>
    </figure>
  );
}
