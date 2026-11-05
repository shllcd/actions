// Shared by the changelog, changesets and release scripts.
import { appendFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const argv = process.argv.slice(2)

export const opt = (name, fallback = '') => {
  const i = argv.indexOf(`--${name}`)
  if (i === -1) return fallback
  const next = argv[i + 1]
  return next && !next.startsWith('--') ? next : true
}

export const flag = (name) => argv.includes(`--${name}`)

export const die = (message) => {
  console.error(`::error::${message}`)
  process.exit(1)
}

// Multi-line values (notes) use a random delimiter, as GitHub requires.
export function emit(outputs) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      Object.entries(outputs).map(([key, value]) => outputLine(key, String(value))).join(''),
    )
  }
  console.log(JSON.stringify(outputs, null, 2))
  process.exit(0)
}

function outputLine(key, value) {
  if (!value.includes('\n')) return `${key}=${value}\n`
  const delimiter = `ghadelimiter_${randomUUID()}`
  return `${key}<<${delimiter}\n${value}\n${delimiter}\n`
}

// Below 1.0 a breaking change is a minor bump, so dependents are not surprised.
export function nextVersion(previous, bump) {
  let [major, minor, patch] = previous.split('.').map(Number)
  if (bump === 'major') {
    if (major === 0) return `0.${minor + 1}.0`
    return `${major + 1}.0.0`
  }
  if (bump === 'minor' || previous === '0.0.0') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}
