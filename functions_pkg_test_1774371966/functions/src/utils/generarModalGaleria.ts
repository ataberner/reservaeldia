type GaleriaCell = {
  mediaUrl?: string | null;
};

type ObjetoGaleria = {
  tipo?: string;
  cells?: GaleriaCell[];
};

export function hayGaleriaConImagenes(objetos: any[] = []): boolean {
  return objetos.some((obj: ObjetoGaleria) => {
    if (obj?.tipo !== "galeria" || !Array.isArray(obj?.cells)) return false;
    return obj.cells.some(
      (cell) => typeof cell?.mediaUrl === "string" && cell.mediaUrl.trim().length > 0
    );
  });
}

export function generarModalGaleriaHTML(): string {
  return `
<style>
  .objeto.galeria .galeria-celda--clickable {
    cursor: zoom-in;
  }

  .objeto.galeria .galeria-celda--clickable:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.95);
    outline-offset: -2px;
  }

  .gallery-lightbox {
    position: fixed;
    inset: 0;
    z-index: 11000;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition: opacity 0.32s ease, visibility 0.32s ease;
  }

  .gallery-lightbox.is-open {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
  }

  .gallery-lightbox__backdrop {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(circle at 50% 10%, rgba(66, 66, 75, 0.35), transparent 48%),
      rgba(7, 8, 11, 0.96);
    backdrop-filter: blur(8px);
  }

  .gallery-lightbox__stage {
    position: relative;
    z-index: 1;
    width: min(1320px, 100vw);
    height: min(94vh, 920px);
    margin: 0 auto;
    padding: clamp(24px, 4vw, 44px) clamp(56px, 8vw, 120px);
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.65fr) minmax(0, 1fr);
    align-items: center;
    gap: clamp(10px, 2.2vw, 28px);
  }

  .gallery-lightbox__slot {
    width: 100%;
    height: min(84vh, 780px);
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 20px;
    overflow: hidden;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.36);
    transition: opacity 0.26s ease, transform 0.26s ease, filter 0.26s ease;
  }

  .gallery-lightbox__slot img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: contain;
  }

  .gallery-lightbox__slot[data-gallery-slot="prev"] {
    opacity: 0.52;
    transform: translateX(10%) scale(0.9);
    filter: saturate(0.72);
  }

  .gallery-lightbox__slot[data-gallery-slot="current"] {
    opacity: 1;
    transform: scale(1);
    filter: none;
  }

  .gallery-lightbox__slot[data-gallery-slot="next"] {
    opacity: 0.52;
    transform: translateX(-10%) scale(0.9);
    filter: saturate(0.72);
  }

  .gallery-lightbox__slot.is-empty {
    opacity: 0;
    transform: scale(0.85);
    pointer-events: none;
  }

  .gallery-lightbox__nav,
  .gallery-lightbox__close {
    position: absolute;
    z-index: 2;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 9999px;
    background: rgba(15, 16, 22, 0.62);
    color: #fff;
    cursor: pointer;
    transition: background 0.2s ease, transform 0.2s ease;
    backdrop-filter: blur(4px);
  }

  .gallery-lightbox__nav:hover,
  .gallery-lightbox__close:hover {
    background: rgba(22, 25, 34, 0.9);
    transform: translateY(-1px);
  }

  .gallery-lightbox__nav {
    top: 50%;
    transform: translateY(-50%);
    width: 52px;
    height: 52px;
    font-size: 28px;
    line-height: 1;
  }

  .gallery-lightbox__nav--prev {
    left: clamp(10px, 2vw, 32px);
  }

  .gallery-lightbox__nav--next {
    right: clamp(10px, 2vw, 32px);
  }

  .gallery-lightbox__nav:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .gallery-lightbox__close {
    top: clamp(14px, 2.5vh, 26px);
    right: clamp(14px, 2vw, 28px);
    width: 44px;
    height: 44px;
    font-size: 24px;
    line-height: 1;
  }

  .gallery-lightbox__counter {
    position: absolute;
    z-index: 2;
    bottom: clamp(12px, 2vh, 24px);
    left: 50%;
    transform: translateX(-50%);
    color: rgba(255, 255, 255, 0.9);
    background: rgba(14, 16, 24, 0.55);
    border: 1px solid rgba(255, 255, 255, 0.18);
    padding: 8px 14px;
    border-radius: 9999px;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.03em;
  }

  @media (max-width: 900px) {
    .gallery-lightbox__stage {
      grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.8fr) minmax(0, 0.9fr);
      padding: 64px 12px 66px;
      height: 100dvh;
      height: 100vh;
      gap: 12px;
    }

    .gallery-lightbox__slot {
      height: min(76vh, 700px);
      border-radius: 16px;
    }

    .gallery-lightbox__slot[data-gallery-slot="prev"] {
      opacity: 0.34;
      transform: translateX(22%) scale(0.84);
    }

    .gallery-lightbox__slot[data-gallery-slot="next"] {
      opacity: 0.34;
      transform: translateX(-22%) scale(0.84);
    }
  }

  @media (max-width: 640px) {
    .gallery-lightbox__stage {
      width: 100vw;
      max-width: 100vw;
      height: 100dvh;
      height: 100vh;
      grid-template-columns: minmax(0, 1fr);
      padding:
        calc(env(safe-area-inset-top, 0px) + 8px)
        calc(env(safe-area-inset-right, 0px) + 4px)
        calc(env(safe-area-inset-bottom, 0px) + 50px)
        calc(env(safe-area-inset-left, 0px) + 4px);
      gap: 0;
      align-items: stretch;
    }

    .gallery-lightbox__slot {
      height: 100%;
      border-radius: 12px;
    }

    .gallery-lightbox__slot[data-gallery-slot="prev"],
    .gallery-lightbox__slot[data-gallery-slot="next"] {
      display: none;
    }

    .gallery-lightbox__slot[data-gallery-slot="current"] {
      background: transparent;
      border: none;
      border-radius: 0;
      box-shadow: none;
    }

    .gallery-lightbox__slot[data-gallery-slot="current"] img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .gallery-lightbox__nav {
      width: 42px;
      height: 42px;
      font-size: 24px;
    }

    .gallery-lightbox__nav--prev {
      left: calc(env(safe-area-inset-left, 0px) + 6px);
    }

    .gallery-lightbox__nav--next {
      right: calc(env(safe-area-inset-right, 0px) + 6px);
    }

    .gallery-lightbox__close {
      top: calc(env(safe-area-inset-top, 0px) + 10px);
      right: calc(env(safe-area-inset-right, 0px) + 10px);
    }

    .gallery-lightbox__counter {
      bottom: calc(env(safe-area-inset-bottom, 0px) + 8px);
    }
  }
</style>

<div id="gallery-lightbox" class="gallery-lightbox" aria-hidden="true" role="dialog" aria-modal="true">
  <div class="gallery-lightbox__backdrop" data-gallery-close></div>

  <button type="button" class="gallery-lightbox__close" data-gallery-close aria-label="Cerrar galeria">
    &#10005;
  </button>

  <button type="button" class="gallery-lightbox__nav gallery-lightbox__nav--prev" data-gallery-prev aria-label="Imagen anterior">
    &#8249;
  </button>

  <div class="gallery-lightbox__stage">
    <figure class="gallery-lightbox__slot" data-gallery-slot="prev">
      <img alt="" />
    </figure>
    <figure class="gallery-lightbox__slot" data-gallery-slot="current">
      <img alt="" />
    </figure>
    <figure class="gallery-lightbox__slot" data-gallery-slot="next">
      <img alt="" />
    </figure>
  </div>

  <button type="button" class="gallery-lightbox__nav gallery-lightbox__nav--next" data-gallery-next aria-label="Imagen siguiente">
    &#8250;
  </button>

  <div class="gallery-lightbox__counter" data-gallery-counter>1 / 1</div>
</div>

<script>
(function(){
  function clampIndex(index, total){
    if (!total) return 0;
    var normalized = index % total;
    return normalized < 0 ? normalized + total : normalized;
  }

  function boot(){
    var modal = document.getElementById("gallery-lightbox");
    if (!modal) return;

    var closeEls = Array.from(modal.querySelectorAll("[data-gallery-close]"));
    var prevBtn = modal.querySelector("[data-gallery-prev]");
    var nextBtn = modal.querySelector("[data-gallery-next]");
    var counter = modal.querySelector("[data-gallery-counter]");

    var prevSlot = modal.querySelector('[data-gallery-slot="prev"]');
    var currentSlot = modal.querySelector('[data-gallery-slot="current"]');
    var nextSlot = modal.querySelector('[data-gallery-slot="next"]');

    var prevImg = prevSlot ? prevSlot.querySelector("img") : null;
    var currentImg = currentSlot ? currentSlot.querySelector("img") : null;
    var nextImg = nextSlot ? nextSlot.querySelector("img") : null;
    var stage = modal.querySelector(".gallery-lightbox__stage");

    var state = {
      images: [],
      index: 0,
      isOpen: false,
      originalOverflow: ""
    };

    function setSlotImage(imgNode, src, altText){
      if (!imgNode) return;
      if (!src) {
        imgNode.removeAttribute("src");
        imgNode.alt = "";
        return;
      }
      if (imgNode.getAttribute("src") !== src) {
        imgNode.setAttribute("src", src);
      }
      imgNode.alt = altText || "";
    }

    function refresh(){
      var total = state.images.length;
      if (!total) return;

      state.index = clampIndex(state.index, total);
      var currentIndex = state.index;
      var hasNeighbors = total > 1;

      var prevIndex = clampIndex(currentIndex - 1, total);
      var nextIndex = clampIndex(currentIndex + 1, total);

      setSlotImage(currentImg, state.images[currentIndex], "Imagen " + (currentIndex + 1));
      setSlotImage(
        prevImg,
        hasNeighbors ? state.images[prevIndex] : "",
        hasNeighbors ? "Imagen anterior" : ""
      );
      setSlotImage(
        nextImg,
        hasNeighbors ? state.images[nextIndex] : "",
        hasNeighbors ? "Imagen siguiente" : ""
      );

      if (prevSlot) prevSlot.classList.toggle("is-empty", !hasNeighbors);
      if (nextSlot) nextSlot.classList.toggle("is-empty", !hasNeighbors);

      if (counter) counter.textContent = (currentIndex + 1) + " / " + total;
      if (prevBtn) prevBtn.disabled = !hasNeighbors;
      if (nextBtn) nextBtn.disabled = !hasNeighbors;
    }

    function open(images, startIndex){
      if (!Array.isArray(images) || !images.length) return;
      state.images = images.slice();
      state.index = clampIndex(Number(startIndex) || 0, state.images.length);
      state.isOpen = true;

      state.originalOverflow = document.body.style.overflow || "";
      document.body.style.overflow = "hidden";

      modal.setAttribute("aria-hidden", "false");
      modal.classList.add("is-open");
      refresh();

      if (closeEls[0] && typeof closeEls[0].focus === "function") {
        closeEls[0].focus();
      }
    }

    function close(){
      if (!state.isOpen) return;
      state.isOpen = false;
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
      document.body.style.overflow = state.originalOverflow;
    }

    function navigate(step){
      if (!state.isOpen || state.images.length < 2) return;
      state.index = clampIndex(state.index + step, state.images.length);
      refresh();
    }

    closeEls.forEach(function(el){
      el.addEventListener("click", function(ev){
        ev.preventDefault();
        close();
      });
    });

    if (prevBtn) {
      prevBtn.addEventListener("click", function(ev){
        ev.preventDefault();
        navigate(-1);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener("click", function(ev){
        ev.preventDefault();
        navigate(1);
      });
    }

    document.addEventListener("keydown", function(ev){
      if (!state.isOpen) return;
      if (ev.key === "Escape") {
        ev.preventDefault();
        close();
        return;
      }
      if (ev.key === "ArrowLeft") {
        ev.preventDefault();
        navigate(-1);
        return;
      }
      if (ev.key === "ArrowRight") {
        ev.preventDefault();
        navigate(1);
      }
    });

    if (stage) {
      var startX = 0;
      var startY = 0;
      var pointerDown = false;

      stage.addEventListener("touchstart", function(ev){
        if (!ev.touches || !ev.touches.length) return;
        pointerDown = true;
        startX = ev.touches[0].clientX;
        startY = ev.touches[0].clientY;
      }, { passive: true });

      stage.addEventListener("touchend", function(ev){
        if (!pointerDown || !ev.changedTouches || !ev.changedTouches.length) return;
        pointerDown = false;
        var endX = ev.changedTouches[0].clientX;
        var endY = ev.changedTouches[0].clientY;
        var dx = endX - startX;
        var dy = endY - startY;

        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
          navigate(dx > 0 ? -1 : 1);
        }
      }, { passive: true });
    }

    var galleries = Array.from(document.querySelectorAll(".objeto.galeria"));
    galleries.forEach(function(gallery){
      var cells = Array.from(
        gallery.querySelectorAll('.galeria-celda[data-gallery-image="1"]')
      );
      if (!cells.length) return;

      var images = cells
        .map(function(cell){
          var img = cell.querySelector("img");
          if (!img) return "";
          return (img.getAttribute("src") || "").trim();
        })
        .filter(Boolean);

      if (!images.length) return;

      gallery.addEventListener("click", function(ev){
        var target = ev.target;
        if (!(target instanceof Element)) return;

        var cell = target.closest('.galeria-celda[data-gallery-image="1"]');
        if (!cell || !gallery.contains(cell)) return;

        var index = cells.indexOf(cell);
        if (index < 0) return;

        ev.preventDefault();
        ev.stopPropagation();
        open(images, index);
      });

      gallery.addEventListener("keydown", function(ev){
        if (ev.key !== "Enter" && ev.key !== " ") return;
        var target = ev.target;
        if (!(target instanceof Element)) return;

        var cell = target.closest('.galeria-celda[data-gallery-image="1"]');
        if (!cell || !gallery.contains(cell)) return;

        var index = cells.indexOf(cell);
        if (index < 0) return;

        ev.preventDefault();
        open(images, index);
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
</script>
`.trim();
}
