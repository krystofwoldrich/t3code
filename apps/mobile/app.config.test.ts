import { afterEach, expect, it, vi } from "vite-plus/test";

// Keep config parsing independent of local env files and build credentials.
vi.mock("../../scripts/lib/public-config.ts", () => ({
  loadRepoEnv: () => ({ APP_VARIANT: process.env.APP_VARIANT }),
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

async function loadConfig(variant: string | undefined) {
  vi.resetModules();
  vi.stubEnv("APP_VARIANT", variant);
  return (await import("./app.config.ts")).default;
}

it.each(["prod", ""])("rejects APP_VARIANT=%j before selecting production IDs", async (value) => {
  await expect(loadConfig(value)).rejects.toThrow(
    "APP_VARIANT must be development, preview, or production.",
  );
});

it.each([
  [undefined, "com.krystofwoldrich.t3code", "t3code-kw"],
  ["development", "com.krystofwoldrich.t3code.dev", "t3code-kw-dev"],
  ["preview", "com.krystofwoldrich.t3code.preview", "t3code-kw-preview"],
  ["production", "com.krystofwoldrich.t3code", "t3code-kw"],
])("isolates the fork identity for APP_VARIANT=%j", async (value, identifier, scheme) => {
  const config = await loadConfig(value);
  expect(config.ios?.bundleIdentifier).toBe(identifier);
  expect(config.android?.package).toBe(identifier);
  expect(config.scheme).toBe(scheme);
  expect(config.ios?.appleTeamId).toBe("9734H7B7Y9");
  expect(config.ios?.entitlements?.["keychain-access-groups"]).toEqual([
    `$(AppIdentifierPrefix)${identifier}`,
  ]);
  expect(config.ios?.supportsTablet).toBe(true);
  expect(config.ios?.associatedDomains).toEqual([]);
  expect(config.android?.intentFilters).toEqual([]);
  expect(config.owner).toBe("krystofwoldrich");
  expect(config.extra?.eas.projectId).toBe("230cb4ca-3f44-49c3-9e35-4e72da7249a2");
  expect(config.updates?.url).toBe(`https://u.expo.dev/${config.extra?.eas.projectId}`);
  expect(config.extra?.relay.url).toBeNull();
  expect(config.extra?.clerk.publishableKey).toBeNull();
  expect(config.plugins).toContainEqual([
    "expo-sharing",
    expect.objectContaining({
      ios: expect.objectContaining({
        extensionBundleIdentifier: `${identifier}.sharing`,
        appGroupId: `group.${identifier}`,
      }),
    }),
  ]);
  expect(config.plugins).toContainEqual([
    "expo-widgets",
    expect.objectContaining({
      bundleIdentifier: `${identifier}.widgets`,
      groupIdentifier: `group.${identifier}`,
    }),
  ]);
});
