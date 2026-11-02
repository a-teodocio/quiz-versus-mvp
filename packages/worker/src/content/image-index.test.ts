import { describe, expect, it } from 'vitest';
import { ImageIndex } from './image-index.js';

const images = (...pairs: [string, string][]): ReadonlyMap<string, string> => new Map(pairs);

describe('ImageIndex', () => {
  it('finds the picture behind a name from any room', () => {
    const index = new ImageIndex();
    index.register('room-a', images(['aaa', 'images/c/one.png']));
    index.register('room-b', images(['bbb', 'images/c/two.png']));
    expect(index.pathFor('aaa')).toBe('images/c/one.png');
    expect(index.pathFor('bbb')).toBe('images/c/two.png');
    expect(index.pathFor('ccc')).toBeUndefined();
  });

  it('reports a name another room already uses', () => {
    const index = new ImageIndex();
    index.register('room-a', images(['aaa', 'images/c/one.png']));
    expect(index.collidesWith(['zzz', 'aaa'])).toBe(true);
    expect(index.collidesWith(['zzz'])).toBe(false);
    expect(index.collidesWith([])).toBe(false);
  });

  it('forgets a room when it is released, and leaves other rooms alone', () => {
    const index = new ImageIndex();
    index.register('room-a', images(['aaa', 'images/c/one.png']));
    index.register('room-b', images(['bbb', 'images/c/two.png']));
    index.release('room-a');
    index.release('room-a');
    expect(index.pathFor('aaa')).toBeUndefined();
    expect(index.collidesWith(['aaa'])).toBe(false);
    expect(index.pathFor('bbb')).toBe('images/c/two.png');
  });

  it('replaces a room’s earlier names when it registers again', () => {
    const index = new ImageIndex();
    index.register('room-a', images(['aaa', 'images/c/one.png']));
    index.register('room-a', images(['ddd', 'images/c/four.png']));
    expect(index.pathFor('aaa')).toBeUndefined();
    expect(index.pathFor('ddd')).toBe('images/c/four.png');
  });
});
