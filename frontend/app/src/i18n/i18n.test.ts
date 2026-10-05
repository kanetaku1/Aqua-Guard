import { describe, expect, it } from 'vitest'
import en from './en.json'
import id from './id.json'

/** Every English string has a Bahasa Indonesia one with the same {{placeholders}} and <tags> (GLOSSARY-id.md). */

type Tree = { [key: string]: string | Tree }
const flatten = (tree: Tree, prefix = ''): [string, string][] =>
  Object.entries(tree).flatMap(([k, v]) => (typeof v === 'string' ? [[prefix + k, v] as [string, string]] : flatten(v, `${prefix}${k}.`)))
const marks = (s: string) => [...s.matchAll(/\{\{[^}]+\}\}|<\/?[a-z]+\s*\/?>/g)].map((m) => m[0]).sort()

describe('id.json', () => {
  const enStrings = new Map(flatten(en as Tree))
  const idStrings = new Map(flatten(id as Tree))

  it('has every key of en.json and no other', () => {
    expect([...idStrings.keys()].filter((k) => !enStrings.has(k))).toEqual([])
    expect([...enStrings.keys()].filter((k) => !idStrings.get(k)?.trim())).toEqual([])
  })

  it('keeps the placeholders and tags of each string', () => {
    const differing = [...enStrings].filter(([k, v]) => idStrings.has(k) && marks(v).join() !== marks(idStrings.get(k)!).join()).map(([k]) => k)
    expect(differing).toEqual([])
  })
})
