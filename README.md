# actions

| Action | Purpose |
|---|---|
| `prepare-release` | Determine the next version and release notes |
| `changelog` | Get the next version and notes from `CHANGELOG.md` |
| `changesets` | Apply pending changesets and read the new version |
| `setup-rust` | Set up a Rust toolchain for CI |
| `cargo-build` | Build a Rust binary for release |
| `publish-crates` | Publish Rust crates to crates.io |
| `publish-npm` | Publish packages to npm |
| `publish-release` | Commit the bump and create a GitHub release |

```yaml
- uses: shllcd/actions/prepare-release@v1
```

Inputs are documented in each `action.yml`. Full workflows are in [`examples/`](examples).
