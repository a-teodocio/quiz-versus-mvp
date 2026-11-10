import { describe, expect, it } from 'vitest';
import { decide, decideCommand, splitCommands } from './pr-guard-policy.mjs';

describe('splitCommands', () => {
  it('splits on separators outside quotes and keeps quoted text as one word', () => {
    expect(splitCommands(`git status && gh pr view 3 --jq '.a | .b'; echo "x; y"`)).toEqual([
      ['git', 'status'],
      ['gh', 'pr', 'view', '3', '--jq', '.a | .b'],
      ['echo', 'x; y'],
    ]);
  });

  it('returns null when a quote is never closed', () => {
    expect(splitCommands(`gh pr view "3`)).toBeNull();
  });
});

describe('commands that do not run gh pass untouched', () => {
  it.each([
    'npm run check',
    'git push -u origin chore/x',
    'git log --oneline -5 | head',
    'cat docs/gh.md',
    'git checkout gh-pages',
    `node -e "console.log($(echo 1))"`,
  ])('%s', (command) => {
    expect(decideCommand(command).allow).toBe(true);
  });
});

describe('gh commands on the list are allowed', () => {
  it.each([
    'gh pr create --draft --title "chore: x" --body-file C:/tmp/body.md',
    'gh pr create -d --base main --title t --body-file b.md',
    'gh pr create --draft=true --title t --body-file b.md',
    'gh pr view 35 --json body --jq .body',
    'gh pr -R owner/repo view 35',
    'gh pr --repo=owner/repo list --state all',
    'gh pr ready 35 --undo',
    'gh pr comment 35 --body-file review.md',
    'gh pr edit 35 --body-file body.md',
    'gh pr checks 35',
    'gh pr diff 35',
    'gh pr close 35',
    'gh api repos/{owner}/{repo}/rulesets --jq ".[].name"',
    'gh api -X GET repos/o/r/pulls/3 --paginate',
    'gh api --method=get repos/o/r/issues/32/timeline --jq .[].event',
    'gh run view 123 --log',
    'gh auth status',
    'gh issue create --title t --body-file b.md',
    'gh --version',
    'gh',
    `& 'C:\\Program Files\\GitHub CLI\\gh.exe' pr view 3`,
    'GH PR VIEW 3',
    'git fetch && gh pr view 3 | head -5',
  ])('%s', (command) => {
    expect(decideCommand(command)).toMatchObject({ allow: true });
  });
});

/** Each case: the command, and a part of the reason it must give. */
const REFUSALS = [
  // Releasing and merging belong to the owner.
  ['gh pr create --title t --body-file b.md', 'open the pull request as a draft'],
  ['gh pr create --draft=false --title t', 'open the pull request as a draft'],
  ['gh pr create --fill', 'open the pull request as a draft'],
  ['gh pr ready 35', 'only the owner marks a pull request ready'],
  ['gh pr ready 35 --undo=false', 'only the owner marks a pull request ready'],
  ['gh pr merge 35 --auto --merge', 'the author never merges'],
  ['gh pr merge 35 --disable-auto', 'the author never merges'],
  ['gh pr reopen 35', 'turns auto-merge on'],
  ['gh pr review 35 --approve', '"gh pr review" is not on the list'],
  ['gh pr update-branch 35', '"gh pr update-branch" is not on the list'],
  ['gh pr', '"gh pr " is not on the list'],
  ['gh pr --web view 3', 'put "--web" after the subcommand'],
  // Spelled differently, still gh.
  ['GH pr merge 35', 'the author never merges'],
  ['/usr/bin/gh pr merge 35', 'the author never merges'],
  [`& 'C:\\Program Files\\GitHub CLI\\gh.exe' pr ready 35`, 'only the owner marks'],
  ['C:\\tools\\gh.exe pr merge 35', 'the author never merges'],
  ['g\\h pr merge 35', 'the author never merges'],
  ['"g"h pr merge 35', 'the author never merges'],
  ['git status; gh pr merge 35', 'the author never merges'],
  ['git status && gh pr ready 35', 'only the owner marks'],
  // The API may only read.
  ['gh api -X PUT repos/o/r/pulls/35/merge', 'gh api may only use GET'],
  ['gh api --method=POST repos/o/r/merges', 'gh api may only use GET'],
  ['gh api repos/o/r/pulls/35/merge -f merge_method=merge', 'gh api may only read'],
  ['gh api repos/o/r/rulesets/1 --input rules.json', 'gh api may only read'],
  ['gh api repos/o/r/pulls -F draft=false', 'gh api may only read'],
  ['gh api graphql --jq .data', 'gh api graphql is not allowed'],
  ['gh api -XPUT repos/o/r/pulls/35/merge', 'gh api may only read'],
  ['gh api repos/o/r/a repos/o/r/b', 'exactly one endpoint'],
  ['gh api --jq', '--jq needs a value'],
  // Other gh commands are on a short list.
  ['gh repo edit --enable-auto-merge', '"gh repo edit" is not on the list'],
  ['gh secret set AUTO_MERGE_TOKEN', '"gh secret" is not on the list'],
  ['gh auth token', '"gh auth token" is not on the list'],
  ['gh alias set m "pr merge"', '"gh alias" is not on the list'],
  ['gh m 35', '"gh m" is not on the list'],
  ['gh run rerun 123', '"gh run rerun" is not on the list'],
  ['gh --repo o/r pr merge 35', '"gh --repo" is not on the list'],
  // What it cannot read, it refuses.
  ['gh pr create --draft --title "$TITLE"', 'no variables or splatting'],
  ['gh pr create --draft @args', 'no variables or splatting'],
  ['gh pr create --draft --body "$(cat body.md)"', 'may not use $(...)'],
  ['gh pr `echo merge` 35', 'may not use $(...), backticks'],
  ['gh pr create --draft --body-file - <<EOF', 'here-documents'],
  ['bash -c "gh pr merge 35"', 'another shell or a wrapper'],
  ['powershell -Command "gh pr merge 35"', 'another shell or a wrapper'],
  ['Invoke-Expression "gh pr merge 35"', 'another shell or a wrapper'],
  ['iex "gh pr ready 35"', 'another shell or a wrapper'],
  ['env GH_REPO=o/r gh pr merge 35', 'another shell or a wrapper'],
  ['command gh pr merge 35', 'another shell or a wrapper'],
  ['echo 35 | xargs gh pr merge', 'another shell or a wrapper'],
  ['gh pr view "3', 'a quote is not closed'],
];

describe('gh commands that are refused, with the reason', () => {
  it.each(REFUSALS)('%s', (command, reason) => {
    const verdict = decideCommand(command);
    expect(verdict.allow).toBe(false);
    expect(verdict.reason).toContain('pr-guard: ');
    expect(verdict.reason).toContain(reason);
  });
});

describe('decide', () => {
  it('judges Bash and PowerShell commands', () => {
    const merge = { command: 'gh pr merge 35' };
    expect(decide({ tool_name: 'Bash', tool_input: merge }).allow).toBe(false);
    expect(decide({ tool_name: 'PowerShell', tool_input: merge }).allow).toBe(false);
  });

  it('leaves other tools alone', () => {
    const verdict = decide({ tool_name: 'Read', tool_input: { file_path: 'gh pr merge' } });
    expect(verdict.allow).toBe(true);
  });

  it('refuses a command it cannot read', () => {
    const verdict = decide({ tool_name: 'Bash', tool_input: {} });
    expect(verdict).toMatchObject({
      allow: false,
      reason: 'pr-guard: the command could not be read',
    });
  });
});
