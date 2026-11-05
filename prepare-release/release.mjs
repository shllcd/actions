#!/usr/bin/env node
// Final release values: tag, notes and manifests. The version comes from
// changelog or changesets when release ran them, otherwise from --version or
// from the latest tag plus --bump.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { opt, flag, die, emit, nextVersion } from '../lib/io.mjs'

const tagPrefix = opt('tag-prefix', 'v')
const notesPath = opt('notes-file', join(process.env.RUNNER_TEMP || tmpdir(), 'release-notes.md'))
const manifestDir = opt('manifest-dir', '.')
const notes = process.env.NOTES ?? ''

let version = opt('version')
let previous = opt('previous')
let bump = opt('bump', 'auto')

if (!version) {
  if (bump === 'auto') bump = 'patch'
  if (!['major', 'minor', 'patch'].includes(bump)) die(`unknown bump "${bump}"`)
  previous = latestTag()
  version = nextVersion(previous, bump)
} else {
  version = version.replace(new RegExp(`^${tagPrefix}`), '')
}
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) die(`"${version}" is not a semver version`)

if (flag('write-manifest')) writeManifest(version)

mkdirSync(dirname(notesPath), { recursive: true })
writeFileSync(notesPath, `${notes}\n`)
// Notes travel as text: a path in RUNNER_TEMP is gone by the next job.
emit({ version, tag: `${tagPrefix}${version}`, previous, bump, notes, 'notes-file': notesPath })

function latestTag() {
  let tags = ''
  try {
    tags = execFileSync('git', ['tag', '--list', `${tagPrefix}*`, '--sort=-v:refname'], { encoding: 'utf8' })
  } catch {
    die('git tag failed: release without source needs a git checkout')
  }
  const found = tags
    .split('\n')
    .map((tag) => tag.slice(tagPrefix.length))
    .find((tag) => /^\d+\.\d+\.\d+$/.test(tag))
  return found ?? '0.0.0'
}

function writeManifest(next) {
  const manifestPath = (name) => join(manifestDir, name)
  if (existsSync(manifestPath('package.json'))) {
    const manifest = JSON.parse(readFileSync(manifestPath('package.json'), 'utf8'))
    manifest.version = next
    // napi and plugin packages pin their native siblings to the same version.
    for (const name of Object.keys(manifest.optionalDependencies ?? {})) {
      manifest.optionalDependencies[name] = next
    }
    writeFileSync(manifestPath('package.json'), JSON.stringify(manifest, null, 2) + '\n')
    console.error(`package.json -> ${next}`)
  }
  if (existsSync(manifestPath('Cargo.toml'))) {
    const cargo = readFileSync(manifestPath('Cargo.toml'), 'utf8').split('\n')
    let section = ''
    let bumpedPackage = false
    const patched = cargo.map((line) => {
      const header = line.match(/^\s*\[([^\]]+)\]\s*$/)
      if (header) {
        section = header[1].trim()
        return line
      }
      const isPackageSection = section === 'package' || section === 'workspace.package'
      if (isPackageSection && !bumpedPackage && /^\s*version\s*=\s*"/.test(line)) {
        bumpedPackage = true
        return line.replace(/version\s*=\s*"[^"]*"/, `version = "${next}"`)
      }
      // A published crate cannot depend on a path without a version.
      if (/dependencies$/.test(section) && /path\s*=\s*"/.test(line)) {
        if (/version\s*=\s*"/.test(line)) {
          return line.replace(/version\s*=\s*"[^"]*"/, `version = "${next}"`)
        }
        return line.replace(/(path\s*=\s*"[^"]*")/, `$1, version = "${next}"`)
      }
      return line
    })
    if (patched.join('\n') !== cargo.join('\n')) {
      writeFileSync(manifestPath('Cargo.toml'), patched.join('\n'))
      console.error(`Cargo.toml -> ${next}`)
    }
  }
}
