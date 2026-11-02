import { describe, expect, it } from 'vitest';
import { vitestArguments } from './qa-ws-args.mjs';

describe('vitestArguments', () => {
  it('maps the flags the tester may pass to Vitest flags', () => {
    expect(vitestArguments(['--grep', 'J1', '--workers', '2', '--retries', '1'])).toEqual({
      args: ['-t', 'J1', '--maxWorkers', '2', '--retry', '1'],
    });
  });

  it('accepts the --flag=value spelling too', () => {
    expect(vitestArguments(['--grep=P3,P4', '--retries=0'])).toEqual({
      args: ['-t', 'P3,P4', '--retry', '0'],
    });
  });

  it('maps the reporters', () => {
    expect(vitestArguments(['--reporter', 'list'])).toEqual({ args: ['--reporter=verbose'] });
    expect(vitestArguments(['--reporter', 'dot'])).toEqual({ args: ['--reporter=dot'] });
    expect(vitestArguments(['--reporter', 'line'])).toEqual({ args: ['--reporter=default'] });
  });

  it('passes nothing when there are no flags', () => {
    expect(vitestArguments([])).toEqual({ args: [] });
  });

  it.each([
    [['--project', 'chromium'], '--project is not supported by qa:ws'],
    [['--repeat-each', '3'], '--repeat-each is not supported by qa:ws'],
    [['--update-snapshots', 'true'], '--update-snapshots is not a flag qa:ws knows'],
    [['--grep'], '--grep needs a value'],
  ])('refuses %j with a reason', (flags, error) => {
    expect(vitestArguments(flags)).toEqual({ error });
  });
});
