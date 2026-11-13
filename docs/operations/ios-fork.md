# T3 Code KW iOS development

This fork builds under [@krystofwoldrich/t3-code-kw](https://expo.dev/accounts/krystofwoldrich/projects/t3-code-kw)
using Apple team `9734H7B7Y9`. [App identity](../../apps/mobile/app.identity.ts) owns the identifiers.
The installed T3 Code app can remain alongside both KW variants.

Every push to this fork's `main` starts **Fork iOS Builds** in
[Expo Workflows](https://expo.dev/accounts/krystofwoldrich/projects/t3-code-kw/workflows),
using [ios.yml](../../apps/mobile/.eas/workflows/ios.yml):

- `development-simulator`: **T3 Code KW Dev**, `com.krystofwoldrich.t3code.dev`.
  Install it on an iPhone or iPad simulator and connect it to Metro.
- `internal`: **T3 Code KW**, `com.krystofwoldrich.t3code`.
  Install the standalone IPA through its Expo build page on a registered physical iPhone or iPad.
  It includes the JavaScript bundle and runs without Metro.

Both support iPad multitasking and landscape layouts. The minimum iOS/iPadOS version is 18.
Connect directly to a T3 server over the local network or Tailscale; T3 Connect sign-in is disabled.
Expo updates belong to the KW project, so these apps never download official T3 updates.

## Develop locally

Run `vp i` at the repository root. Start an isolated server with `vp run dev`, then run
`vp run dev:client` from `apps/mobile` and open its `t3code-kw-dev` development-client link.
Use the same simulator build for iPhone and iPad; select an iPad simulator to work on tablet layouts.
For device-panel testing, use `vp run mobile:install ios <device-id>` from the root.

To queue builds manually, run these from `apps/mobile` with EAS CLI 27.9.0 or newer:

```sh
eas build --platform ios --profile development-simulator
eas build --platform ios --profile internal
```

To run both builds together, use `eas workflow:run ios.yml` from `apps/mobile`.

Use the `development` profile for a physical-device development client if needed. It requires
its own provisioning profiles for the `.dev` app and extension identifiers.

## Signing and CI access

Expo's GitHub app connects `krystofwoldrich/t3code` to the KW project with the base directory
`apps/mobile`. Expo Workflows runs the builds directly; no GitHub Actions secret is needed.
EAS stores the distribution certificate and separate ad hoc provisioning profiles for the app,
share extension, and widgets. No Apple password or private signing material belongs in Git.

When adding a device, run `eas device:create`, select this Apple team, and import it from the
Developer Portal or follow the registration URL on the device. Then run an interactive
`eas credentials:configure-build --platform ios --profile internal` to refresh all targets'
profiles before triggering another build. Registering a device in Apple alone does not add it
to Expo's device list or an existing IPA.

## Fork icon

Edit the vector layers in `assets/fork/app-icon.icon`; export the fallback PNG with Icon Composer:

```sh
"/Applications/Xcode.app/Contents/Applications/Icon Composer.app/Contents/Executables/ictool" \
  assets/fork/app-icon.icon --export-image --output-file assets/fork/kw-ios-1024.png \
  --platform iOS --rendition Default --width 1024 --height 1024 --scale 1 --design-generation 26
```

Rebuild the native app after changing its identity, icon, entitlements, or native dependencies.
