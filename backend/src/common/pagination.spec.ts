import { pageArgsFor } from './pagination'

describe('pageArgsFor', () => {
  it('returns null when neither page nor limit is given, so callers keep the full-list behaviour', () => {
    expect(pageArgsFor(undefined, undefined)).toBeNull()
  })

  it('defaults limit to 20 and page to 1 when only one of them is given', () => {
    expect(pageArgsFor(undefined, 5)).toEqual({ skip: 0, take: 5, page: 1, limit: 5 })
    expect(pageArgsFor(3, undefined)).toEqual({ skip: 40, take: 20, page: 3, limit: 20 })
  })
})
