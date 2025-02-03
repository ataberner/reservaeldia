// Función para reproducir la música
function playAudio() {
    let audio = document.getElementById("audioPlayer");
    audio.play();

    // Cambia los botones
    document.getElementById("btnPlay").classList.add("hidden");
    document.getElementById("btnPause").classList.remove("hidden");
}

// Función para pausar la música
function pauseAudio() {
    let audio = document.getElementById("audioPlayer");
    audio.pause();

    // Cambia los botones
    document.getElementById("btnPlay").classList.remove("hidden");
    document.getElementById("btnPause").classList.add("hidden");
}
