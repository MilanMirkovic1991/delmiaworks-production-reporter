import { describe, it, expect } from 'vitest';
import { buildFilter } from '../../src/dwClient/filter.js';

describe('buildFilter', () => {
  it('returns empty string for empty filter object', () => {
    expect(buildFilter({})).toBe('');
  });

  it('builds single equality filter', () => {
    expect(buildFilter({ ArInvtId: 123 })).toBe('(ArInvtId.eq~123~)');
  });

  it('builds AND of multiple equalities', () => {
    expect(buildFilter({ ArInvtId: 123, Status: 'Active' }))
      .toBe('(ArInvtId.eq~123~&Status.eq~Active~)');
  });

  it('supports explicit operator', () => {
    expect(buildFilter({ TotalQTYOrdered: { op: 'gt', value: 0 } }))
      .toBe('(TotalQTYOrdered.gt~0~)');
  });

  it('escapes ~ characters in values', () => {
    expect(buildFilter({ Description: 'A~B' }))
      .toBe('(Description.eq~A\\~B~)');
  });

  it('handles boolean values', () => {
    expect(buildFilter({ Active: true })).toBe('(Active.eq~true~)');
  });

  it('skips undefined values', () => {
    expect(buildFilter({ ArInvtId: 123, Status: undefined }))
      .toBe('(ArInvtId.eq~123~)');
  });
});
