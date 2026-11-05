# actions

| Action | Purpose |
|---|---|
| `prepare-release` | Determine the next version and release notes |
| `changelog` | Get the next version and notes from `CHANGELOG.md` |
| `changesets` | Apply pending changesets and read the new version |
| `setup-rust` | Set up a Rust toolchain for CI |
| `cargo-build` | Build a Rust binary, cdylib or N-API binding for release |
| `napi-packages` | Turn N-API binding artifacts into per-platform npm packages |
| `publish-crates` | Publish Rust crates to crates.io |
| `publish-npm` | Publish packages to npm |
| `publish-release` | Commit the bump and create a GitHub release |

```yaml
- uses: shllcd/actions/prepare-release@v1
```

Inputs are documented in each `action.yml`. Full workflows are in [`examples/`](examples).

## Reusable workflows

`napi-release.yml` chains prepare, a build matrix, npm publishing and the
release commit for an N-API package. Put your own checks in front with `needs:`:

```yaml
jobs:
  release:
    needs: verify
    permissions:
      contents: write
      id-token: write
    uses: shllcd/actions/.github/workflows/napi-release.yml@v1
    with:
      crate: orisu_napi
      package-dir: packages/orisu
      binding-name: '@orisu/binding-{platform}'
```

See [`examples/orisu-release.yml`](examples/orisu-release.yml).

Every `uses:` inside the workflow is pinned to a commit, so pinning the workflow
itself to a release SHA pins the whole chain. Only the release job keeps the
checkout token, and both publish and release run in `environment`.
