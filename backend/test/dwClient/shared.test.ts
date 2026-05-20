import { describe, it, expect } from 'vitest';
import { pickArray } from '../../src/dwClient/shared.js';

describe('pickArray', () => {
  it('returns body when body is array', () => {
    expect(pickArray([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('returns body.data when body is { data: array }', () => {
    expect(pickArray({ data: ['a', 'b'] })).toEqual(['a', 'b']);
  });

  it('returns [] for null', () => {
    expect(pickArray(null)).toEqual([]);
  });

  it('returns [] for undefined', () => {
    expect(pickArray(undefined)).toEqual([]);
  });

  it('returns [] for object without data', () => {
    expect(pickArray({ foo: 'bar' })).toEqual([]);
  });

  it('returns [] when data is not an array', () => {
    expect(pickArray({ data: 'not array' })).toEqual([]);
  });

  it('returns [] for primitive non-array', () => {
    expect(pickArray('hello')).toEqual([]);
    expect(pickArray(42)).toEqual([]);
  });
});
