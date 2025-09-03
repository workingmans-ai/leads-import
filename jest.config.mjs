export default {
  testEnvironment: "node",
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.mjs$": "$1",
  },
  transform: {},
  testMatch: ["**/test/**/*.test.mjs", "**/test/**/*.spec.mjs"],
  collectCoverageFrom: [
    "src/**/*.mjs",
    "!src/**/*.test.mjs",
    "!src/**/*.spec.mjs",
  ],
};
