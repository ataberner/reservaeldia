// utils/loadFont.js
export function loadGoogleFont(family) {
  // evita duplicados:
  if (document.querySelector(`link[data-font="${family}"]`)) return Promise.resolve();

  return new Promise(res => {
    const link = document.createElement("link");
    link.rel   = "stylesheet";
    link.href  = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@300;400;700&display=swap`;
    link.dataset.font = family;
    document.head.appendChild(link);

    // espera a que el CSS renderice ± rápido
    link.onload = () => document.fonts.load(`1em "${family}"`).then(res);
  });
}
