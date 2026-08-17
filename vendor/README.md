# Optional pinned emulator sources

The checked-in worker and C ABI are ready for the SkyEmu v5 source tree, but
the upstream source is intentionally not vendored into the web bundle. To
provision a local build, check out the immutable v5 tag here:

```bash
git clone --depth 1 --branch v5 https://github.com/skylersaleh/SkyEmu.git vendor/skyemu-v5
EMCC=/path/to/emcc npm run runtime:skyemu:build
```

On macOS with Homebrew, the provisioned toolchain uses:

```bash
brew install emscripten
EMCC="$(brew --prefix emscripten)/bin/emcc" npm run runtime:skyemu:build
```

The build emits `public/emulator/skyemu-v5/skyemu.js`, `skyemu.wasm`, and a
`build.json` record containing the v5 source commit, compiler version, and
artifact hash consumed by the worker. The generated directory is ignored so
the adapter can be provisioned locally without adding a binary to source
control; it is served by Next whenever present. Review SkyEmu's GPL-3.0 license
and acknowledgements before deploying the generated adapter. No ROM, BIOS, or
firmware bytes belong in this directory or in the public build by default.
