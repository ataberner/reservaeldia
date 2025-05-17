module.exports = {
  parser: "@typescript-eslint/parser", // Analiza archivos .ts
  parserOptions: {
    ecmaVersion: 2020, // Soporta ES2020
    sourceType: "module",
    project: ["./tsconfig.json"] // Asegura compatibilidad con TS config
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  rules: {
    // 🎯 Reglas opcionales personalizadas
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
    "no-console": "off" // Permití console.log() si lo necesitás para debug
  },
  ignorePatterns: ["lib/", "node_modules/"]
};
