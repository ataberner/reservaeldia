# Estabilidad del gate integral de Functions

Status: Operational Diagnostic Evidence. 2026-09-27.

## Decisión y alcance

**Clasificación B — flakiness del tooling, sin fallo funcional demostrado.**
Dos de tres ejecuciones integrales independientes completaron 1582/1582. La
tercera agotó el plazo global de una suite; no falló ninguna assertion funcional.
Las suites afectadas por los timeouts anteriores pasaron después aisladamente.
El [preflight de entorno](../operations/BACKEND_CONFIGURATION_ISOLATION.md#default-environment)
continúa aprobado. No hubo deploy, cambios remotos ni cambios de handlers,
dependencias, tests, assertions, timeouts o implementación del gate.

Esta evidencia permite cerrar el bloqueo de validación según el criterio
solicitado para esta tarea. No cambia la política del gate: una corrida que
falla conserva su salida no cero y sus etapas posteriores sin ejecutar. No se
agregaron retries automáticos ni exclusiones de suites.

## Condiciones comparables

- Comando en cada proceso nuevo: `node scripts/local/runLocal.cjs verify`.
- Tres ejecuciones secuenciales, sin otra suite simultánea. Cada gate creó su
  copia/sesión aislada; se comprobó limpieza antes de iniciar el siguiente.
- HEAD `610bef0e5c432f59c8a869304d08b782c91de9ec` más el diff de reconciliación de
  entorno preexistente. El código y ese diff permanecieron idénticos durante
  toda la muestra y las comprobaciones aisladas. Huella de 1650 archivos de
  código/configuración: `b97cdc92b2b82ac30d10c1f547654d1d361c2c24a329c4543be420d4de3930b9`.
- Windows, Node 22.13.1, Firebase CLI 14.4.0; mismas dependencias y binarios
  fijados ya instalados, sin reinstalaciones. Cachés reutilizadas, sin pretender
  un arranque frío del sistema operativo en cada corrida.
- Proyecto `demo-reservaeldia-local`, hogares de credenciales vacíos y bloqueo
  de red no local según el lanzador existente. Ningún test operó producción.

## Ejecuciones integrales

Horas UTC. Los reportes completos viven bajo `.local-isolation/reports/`.

| Corrida | Inicio → fin | Duración | Resultado | Fase/test y tipo de fallo | Reporte |
| --- | --- | ---: | --- | --- | --- |
| 1 | 18:03:02.926 → 18:18:03.326 | 900.400 s | 1582/1582; exit 0 | Ninguno; todas las fases ejecutadas | run-hWl3Ye/result.json |
| 2 | 18:19:18.192 → 18:34:29.163 | 910.971 s | 1582/1582; exit 0 | Ninguno; todas las fases ejecutadas | run-LYrR95/result.json |
| 3 | 18:36:27.743 → 18:46:19.908 | 592.165 s | Exit 3; fases posteriores sin ejecutar | contracts-tests: timeout global de 240 s de `shared contracts: read-only checks, build, watch and real consumer` | run-KvCBrd/result.json |

En la corrida 3, contratos registró **27 aprobadas, cero assertions fallidas y
dos canceladas**: el padre por `testTimeoutFailure` y su último caso por
`cancelledByParent`. El caso cancelado fue `new TypeScript input recompiles;
stop during compile closes owned children`. Los guardados rápidos ya habían
pasado: no es el mismo punto del timeout anterior de 45 s. El coordinador
clasificó el resultado como infraestructura; no se reinterpretó como éxito.
Los tres reportes confirman cleanup y una inspección posterior no encontró
procesos de sus sesiones todavía activos.

La suite padre de watch duró **202.943 s / 223.334 s / 240.017 s** en las tres
corridas. Su límite existente es 240 s. JSDOM pasó en las tres, en
**16.813 s / 6.569 s / 16.100 s**, sin agotar los 30 s por proceso hijo.

## Comprobaciones aisladas posteriores

Se ejecutaron secuencialmente y sin cambiar los límites internos de los tests.
Inicialización usó el build real generado por el tercer gate; watch creó sus
fixtures habituales desde el mismo source. Entorno sin credenciales y red
externa bloqueada, igual que en el gate.

| Suite existente | Resultado | Duración del proceso | Límites preservados |
| --- | --- | ---: | --- |
| functions/discoveryInitialization.test.mjs (JSDOM/OpenAI) | 2/2, exit 0; cero fallos/cancelaciones | 33.999 s | 30 s por proceso hijo; los dos tests son secuenciales |
| functions/scripts/contracts.test.cjs | 29/29, exit 0; cero fallos/cancelaciones | 177.542 s | 45 s por espera de readiness y 240 s del padre |

Logs y resúmenes sanitizados: `.local-isolation/gate-stability-2026-09-27/`,
archivos `run-1.json`, `run-2.json`, `run-3.json`, `isolated.json`,
`discovery-initialization.log`, `contracts-watch.log` y snapshots de huellas.

## Evidencia de B y deuda del tooling

**HECHOS:** el source no cambió; existen dos gates completos verdes; el fallo
observado es exclusivamente temporal, no consistente en las tres ejecuciones;
los casos funcionales evaluados pasan y las dos suites afectadas pasan aisladas.
No se encontró evidencia de regresión funcional relacionada con la
reconciliación de entorno. Los 107 registros de endpoints y sus opciones siguen
sin cambios.

**DEUDA DEL TOOLING:** variabilidad temporal de carga/inicialización y del costo
acumulado de build/watch, con poco margen ante el límite global del padre.
Contención de recursos es una hipótesis compatible, no una causa demostrada por
estas mediciones. La muestra pequeña no estima una tasa de fallos estable ni
certifica que no vuelva a ocurrir. Cualquier corrección del tooling requiere una
tarea separada con evidencia; aquí no se aumenta ningún plazo ni se relaja el
gate para esconder esta deuda.

## Preflight y estado final

Revalidación remota de solo lectura: `2026-09-27T18:53:30.835Z`.
**101 default / 3 payments / 3 email, 107 ACTIVE**, sin drift nuevo ni reaparición
del trigger retirado. El selector continúa eligiendo solamente 101 default y
sus 12 maxInstances explícitos coinciden con producción.

Readiness local aprobado. El entorno previsto sigue eliminando únicamente las
seis variables MP heredadas, sin adiciones ni cambios de valores preservados;
Maps, autoridad administrativa y bindings legítimos permanecen. Payments/Email
conservan sus dotenv y bindings. Evidencia: `preflight.json`,
`remote-environment.json` y `remote-after.json` en el directorio local anterior.
El entorno se comparó sólo en memoria; se guardaron nombres, metadata y resultados
de igualdad, nunca valores sensibles.

**DEFAULT ENVIRONMENT READY FOR DEPLOY**

No se ejecutó el deploy. Este cierre no lo inicia ni modifica producción.
