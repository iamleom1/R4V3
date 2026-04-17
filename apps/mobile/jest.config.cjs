module.exports = {
  rootDir: ".",
  testMatch: ["<rootDir>/src/**/__tests__/**/*.test.ts?(x)", "<rootDir>/src/**/?(*.)+(spec|test).ts?(x)"],
  transform: {
    "^.+\\.[jt]sx?$": ["babel-jest", { configFile: "./babel.config.js" }]
  },
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  setupFiles: ["<rootDir>/jest.globals.js"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^react-native$": "<rootDir>/src/test/reactNativeMock.tsx"
  },
  transformIgnorePatterns: [
    "/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@react-navigation|react-navigation|react-native-gesture-handler|react-native-reanimated)/)"
  ]
};
