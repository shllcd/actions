#!/usr/bin/env node
// Next version from CHANGELOG.md. `## [Unreleased]` is the only source of truth:
// Breaking/Removed -> major (minor below 1.0), Added/Changed/Deprecated -> minor,
// anything else -> patch.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { opt, flag, die, emit, nextVersion } from '../lib/io.mjs'

const changelogPath = opt('changelog', 'CHANGELOG.md')
const bumpArg = opt('bump', 'auto')

if (!existsSync(changelogPath)) die(`${changelogPath} not found`)
const lines = readFileSync(changelogPath, 'utf8').split('\n')

const MAJOR = /^#{3,6}\s*(breaking|removed)\b/i
const MINOR = /^#{3,6}\s*(added|changed|deprecated)\b/i
const RELEASED = /^##\s*\[?v?(\d+\.\d+\.\d+)\]?/

const start = lines.findIndex((line) => /^##\s*\[unreleased\]/i.test(line))
if (start === -1) die(`${changelogPath} has no "## [Unreleased]" section`)

let end = lines.length
for (let i = start + 1; i < lines.length; i++) {
  if (/^##\s/.test(lines[i])) {
    end = i
    break
  }
}

const section = lines.slice(start + 1, end)
const entries = section.filter((line) => line.trim() !== '')
const notes = section.join('\n').trim()
if (entries.length === 0) {
  die('## [Unreleased] has no entries: write the changes first, then release')
}

let auto = 'patch'
for (const line of section) {
  if (MAJOR.test(line)) {
    auto = 'major'
    break
  }
  if (MINOR.test(line)) auto = 'minor'
}

const bump = bumpArg === 'auto' ? auto : bumpArg
if (!['major', 'minor', 'patch'].includes(bump)) die(`unknown bump "${bump}"`)

// Released headings always sit below the Unreleased block.
const previousLine = lines.slice(end).find((line) => RELEASED.test(line))
const previous = previousLine ? previousLine.match(RELEASED)[1] : '0.0.0'
const version = nextVersion(previous, bump)

if (flag('write')) writeChangelog(version)

emit({ version, previous, bump, notes })

function trimTop(blocks) {
  const copy = [...blocks]
  while (copy.length > 0 && copy[0].trim() === '') copy.shift()
  return copy
}

function trimBottom(blocks) {
  const copy = [...blocks]
  while (copy.length > 0 && copy[copy.length - 1].trim() === '') copy.pop()
  return copy
}

function writeChangelog(next) {
  const date = new Date().toISOString().slice(0, 10)
  // Blank lines are normalised around the new heading only: the rest of the file
  // is the project's own markdown and may contain fenced blocks with gaps.
  const out = [
    ...lines.slice(0, start + 1),
    '',
    `## [${next}] - ${date}`,
    '',
    ...trimBottom(trimTop(section)),
    '',
    '',
    ...trimTop(lines.slice(end)),
  ]
  writeFileSync(changelogPath, out.join('\n'))
  console.error(`${changelogPath} -> ${next}`)
}
