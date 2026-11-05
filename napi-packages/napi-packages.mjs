#!/usr/bin/env node
// One npm package per N-API binding. Reads <name>.<target>.node files (the
// cargo-build kind: napi layout) and writes <out>/<platform>/package.json next
// to the binary, with os, cpu and libc so npm installs only the matching one.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'
import { opt, die, emit } from '../lib/io.mjs'

const artifacts = opt('artifacts', 'artifacts')
const packageDir = opt('package-dir', '.')
const out = opt('out', 'dist/npm')
const template = opt('name', '{name}-{platform}')

const ARCH = {
  x86_64: 'x64',
  aarch64: 'arm64',
  i686: 'ia32',
  armv7: 'arm',
  riscv64gc: 'riscv64',
  powerpc64le: 'ppc64',
  s390x: 's390x',
  loongarch64: 'loong64',
}

// Same platform names as napi-rs, so existing package names keep working.
function platformOf(target) {
  const [arch, , os, abi = ''] = target.split('-')
  const cpu = ARCH[arch]
  if (!cpu) die(`unsupported target architecture: ${target}`)
  if (target.includes('apple-darwin')) return { platform: `darwin-${cpu}`, os: 'darwin', cpu }
  if (os === 'windows') return { platform: `win32-${cpu}-${abi}`, os: 'win32', cpu }
  if (os === 'linux') {
    const libc = abi.startsWith('musl') ? 'musl' : 'glibc'
    return { platform: `linux-${cpu}-${abi || 'gnu'}`, os: 'linux', cpu, libc }
  }
  if (os === 'freebsd') return { platform: `freebsd-${cpu}`, os: 'freebsd', cpu }
  if (target.includes('android')) return { platform: `android-${cpu}`, os: 'android', cpu }
  die(`unsupported target: ${target}`)
}

function findBindings(dir) {
  if (!existsSync(dir)) die(`${dir} not found: download the binding artifacts first`)
  const found = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) found.push(...findBindings(path))
    else if (entry.endsWith('.node')) found.push(path)
  }
  return found
}

const manifestPath = join(packageDir, 'package.json')
if (!existsSync(manifestPath)) die(`${manifestPath} not found`)
const main = JSON.parse(readFileSync(manifestPath, 'utf8'))
const version = opt('version') || main.version
if (!version) die(`no version: pass version or set it in ${manifestPath}`)

const bindings = findBindings(artifacts)
if (bindings.length === 0) die(`no .node files under ${artifacts}`)

const dirs = []
const names = []
for (const path of bindings.sort()) {
  const file = basename(path)
  const match = file.match(/^([^.]+)\.([^.]+)\.node$/)
  if (!match) die(`${file} is not <name>.<target>.node`)
  const target = match[2]
  const { platform, os, cpu, libc } = platformOf(target)
  const name = template.replaceAll('{name}', main.name).replaceAll('{platform}', platform)

  const pkg = {
    name,
    version,
    description: main.description ? `${main.description} (${target})` : `${main.name} binding for ${target}`,
    main: file,
    files: [file],
    os: [os],
    cpu: [cpu],
    ...(libc && { libc: [libc] }),
    ...(main.license && { license: main.license }),
    ...(main.repository && { repository: main.repository }),
    ...(main.homepage && { homepage: main.homepage }),
    ...(main.author && { author: main.author }),
    ...(main.engines && { engines: main.engines }),
    ...(main.publishConfig && { publishConfig: main.publishConfig }),
  }

  const dir = join(out, platform)
  mkdirSync(dir, { recursive: true })
  copyFileSync(path, join(dir, file))
  for (const extra of ['LICENSE', 'LICENSE-MIT', 'LICENSE-APACHE']) {
    const from = [join(packageDir, extra), extra].find(existsSync)
    if (from) {
      copyFileSync(from, join(dir, extra))
      pkg.files.push(extra)
    }
  }
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')
  console.error(`${name}@${version} <- ${path}`)
  dirs.push(dir)
  names.push(name)
}

// Every binding the main package expects must have been built.
const missing = Object.keys(main.optionalDependencies ?? {}).filter(
  (dep) => template.includes('{platform}') && matchesTemplate(dep) && !names.includes(dep),
)
if (missing.length > 0) die(`no binding built for ${missing.join(', ')}`)

emit({ dir: out, dirs: dirs.join('\n'), packages: names.join('\n'), version })

function matchesTemplate(dep) {
  const [before, after] = template.replaceAll('{name}', main.name).split('{platform}')
  return dep.startsWith(before) && dep.endsWith(after ?? '')
}
