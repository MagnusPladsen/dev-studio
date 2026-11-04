# Publishing dev-studio-mcp

`.github/workflows/mcp-release.yml` releases the server when `version` in `packages/mcp/package.json` changes on
`main` (or when run by hand from the Actions tab). It:

1. checks what is already out (`npm view dev-studio-mcp@<version>`, GitHub release `mcp-v<version>`),
2. typechecks, runs the server's tests and `npm run smoke` (packs the tarball, installs it in an empty folder, starts
   the installed `dev-studio-mcp` over stdio and lists its tools),
3. builds the Claude Desktop extension with `npm run pack:mcpb`,
4. publishes to npm with provenance under the `latest` tag, when `NPM_TOKEN` is set (otherwise the run shows a
   notice and skips this job),
5. creates the GitHub release `mcp-v<version>` with the `.mcpb` attached, never marked latest (the website's
   desktop downloads use `releases/latest`).

A version that is already on npm or already released is skipped, so a re-run only does what's missing.

## Ship a new version

1. Bump `version` in `packages/mcp/package.json` and `SERVER_VERSION` in `src/server.ts` (a test checks they match).
2. Merge to `main`.

## One-time setup

1. **npm account:** sign up at <https://www.npmjs.com/signup> and turn on two-factor auth. The package name
   `dev-studio-mcp` is unscoped and still free, so no org is needed.
2. **Token:** npmjs.com → Access Tokens → Generate New Token → **Granular Access Token**. Packages and scopes:
   *Read and write*, *All packages* (the package doesn't exist yet, so it can't be picked; narrow it to
   `dev-studio-mcp` after the first publish). Tick **Bypass two-factor authentication** so CI can publish. Pick an
   expiry and note the date.
3. **Repo secret:** GitHub → `MagnusPladsen/dev-studio` → Settings → Secrets and variables → Actions → New repository
   secret, name `NPM_TOKEN`.
4. **First publish:** Actions → MCP release → Run workflow on `main` (the push that added the workflow ran without
   the token, so it skipped npm).
5. **Optional, later:** switch to npm [trusted publishing](https://docs.npmjs.com/trusted-publishers) (package
   settings → Trusted publisher → GitHub Actions, workflow `mcp-release.yml`). Then CI publishes with its OIDC
   identity, needs npm 11.5+ (`npm install -g npm@latest` before publishing), and `NPM_TOKEN` can be deleted.

## Try a bundle locally

```bash
npm run pack:mcpb -w dev-studio-mcp   # → packages/mcp/release/dev-studio-mcp-<version>.mcpb
```

The bundle holds `server/index.js` (the tsup build), the runtime dependencies at the versions this workspace has
installed, and the `@napi-rs/keyring` binaries for macOS (arm64, x64), Windows (x64, arm64) and Linux (x64, arm64 glibc).
Its tool list comes from starting the staged server, so it can't drift from the code.

## Signing the .mcpb (not done yet)

The bundle is unsigned, so Claude Desktop may show it as from an unverified developer. To sign it you need a code
signing certificate and its private key in PEM format, for example from a certificate authority that issues code
signing certificates.

1. Sign and check locally:
   ```bash
   npx -y @anthropic-ai/mcpb@2.1.2 sign packages/mcp/release/dev-studio-mcp-<version>.mcpb --cert cert.pem --key key.pem
   npx -y @anthropic-ai/mcpb@2.1.2 verify packages/mcp/release/dev-studio-mcp-<version>.mcpb
   ```
   Add `--intermediate chain.pem` if the authority gives you an intermediate certificate.
2. To sign in CI, store the two PEM files as secrets (`MCPB_CERT_PEM`, `MCPB_KEY_PEM`), and in the `build` job after
   "Build the .mcpb" write them to files and run the `sign` command above. Never commit the key.

`mcpb sign --self-signed` works for testing, but a self-signed bundle is no more trusted than an unsigned one.
