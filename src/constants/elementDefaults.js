export const ELEMENT_DEFAULTS = {
  position: {
    x: 0,
    y: 0
  },
  rotation: 0,
  scale: 1,
  texto: {
    fontSize: 24,
    minFontSize: 6,
    fontFamily: 'sans-serif',
    fontWeight: 'normal',
    fontStyle: 'normal',
    textDecoration: 'none',
    color: '#000000'
  },
  forma: {
    color: '#000000'
  }
};

export const SHAPE_DIMENSIONS = {
  rect: {
    width: 80,
    height: 80
  },
  circle: {
    radius: 40
  },
  line: {
    width: 80,
    height: 4,
    offsetY: 2
  },
  triangle: {
    points: [0, 80, 40, 0, 80, 80]
  },
  diamond: {
    width: 100,
    height: 100,
  },
  star: {
    width: 110,
    height: 110,
  },
  heart: {
    width: 110,
    height: 98,
  },
  arrow: {
    width: 140,
    height: 80,
  },
  pentagon: {
    width: 110,
    height: 110,
  },
  hexagon: {
    width: 118,
    height: 102,
  },
  pill: {
    width: 160,
    height: 66,
    cornerRadius: 33,
  },
  default: {
    width: 80,
    height: 80
  }
}; 
