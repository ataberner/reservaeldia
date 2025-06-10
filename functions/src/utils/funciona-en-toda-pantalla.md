
  html, body {
    margin: 0;
    padding: 0;
    background: white;
    font-family: sans-serif;
    width: 100%;
    height: 100%;
    overflow-x: hidden;
  }

  .canvas-container {
    width: 100%;
    display: flex;
    justify-content: center;
  }

  .canvas {
    position: relative;
    width: 100%;
    aspect-ratio: 800 / 1400;
    overflow: hidden;
    background: white;
  }

  .seccion {
    position: absolute;
    width: 100%;
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
  }

  .objeto {
    position: absolute;
    transform-origin: top left;
  }
</style>

</head>
<body>
  <div class="canvas-container">
    <div class="canvas">
      ${htmlSecciones}
    </div>
  </div>
</body>
</html>
`;
}