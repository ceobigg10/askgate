import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 20000,
    exclude: ["**/node_modules/**", "**/dist/**", "**/.claude/**"],
  },
});
