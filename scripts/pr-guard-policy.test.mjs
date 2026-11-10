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

  it('splits on a bracket or brace before the first word of a command, and keeps any other', () => {
    expect(splitCommands('(gh pr view 3) && Start-Job {gh pr list}')).toEqual([
      ['gh', 'pr', 'view', '3)'],
      ['Start-Job', '{gh', 'pr', 'list}'],
    ]);
    expect(splitCommands('gh api repos/{owner}/{repo}/pulls')).toEqual([
      ['gh', 'api', 'repos/{owner}/{repo}/pulls'],
    ]);
  });

  it('returns null when a quote is never closed', () => {
    expect(splitCommands(`gh pr view "3`)).toBeNull();
  });
});

describe('commands that never mention gh pass untouched, and are not logged', () => {
  it.each([
    'npm run check',
    'git push -u origin chore/x',
    'git log --oneline -5 | head',
    'git checkout gh-pages',
    `node -e "console.log($(echo 1))"`,
    'git commit -m "$(cat <<\'EOF\'\nfix: a thing\nEOF\n)"',
    'Get-ChildItem | ForEach-Object { $_.Name }',
  ])('%s', (command) => {
    expect(decideCommand(command)).toMatchObject({ allow: true, judged: false });
  });
});

describe('gh commands on the list are allowed', () => {
  it.each([
    'gh pr create --draft --title "chore: x" --body-file C:/tmp/body.md',
    'gh pr create -d --base main --head chore/x --title t --body-file b.md',
    'gh pr create --title t --draft --body "a body that mentions gh pr merge"',
    'gh pr view 35 --json body --jq .body',
    'gh pr -R owner/repo view 35',
    'gh pr --repo=owner/repo list --state all',
    'gh pr ready 35 --undo',
    'gh pr ready --undo',
    'gh pr ready https://github.com/o/r/pull/35 --undo -R o/r',
    'gh pr comment 35 --body-file review.md',
    'gh pr comment 35 --body-file docs/env',
    'gh pr edit 35 --body-file body.md',
    'gh pr checks 35',
    'gh pr diff 35 --name-only',
    'gh pr close 35',
    'gh api repos/{owner}/{repo}/rulesets --jq ".[].name"',
    'gh api -X GET repos/o/r/pulls/3 --paginate',
    'gh api --method=get repos/o/r/issues/32/timeline --jq .[].event',
    'gh run view 123 --log',
    'gh auth status',
    'gh auth status --hostname github.com -a',
    'gh issue create --title t --body-file b.md',
    'gh search code sh',
    'gh --version',
    'gh',
    `& 'C:\\Program Files\\GitHub CLI\\gh.exe' pr view 3`,
    'GH PR VIEW 3',
    'git fetch && gh pr view 3 | head -5',
    '(gh pr view 3)',
    'cat docs/gh.md',
  ])('%s', (command) => {
    expect(decideCommand(command)).toMatchObject({ allow: true, judged: true });
  });
});

/** Each case: the command, and a part of the reason it must give. */
const REFUSALS = [
  // Releasing and merging belong to the owner.
  ['gh pr create --title t --body-file b.md', 'open the pull request as a draft'],
  ['gh pr create --draft=false --title t', 'the flag "--draft=false" is not on the list'],
  ['gh pr create --draft=true --title t', 'the flag "--draft=true" is not on the list'],
  ['gh pr create -d -d=false --title t', 'the flag "-d=false" is not on the list'],
  ['gh pr create --fill --draft', 'the flag "--fill" is not on the list'],
  ['gh pr create --draft my-title', 'takes no plain words'],
  ['gh pr ready 35', 'only the owner marks a pull request ready'],
  ['gh pr ready 35 --undo=false', 'the flag "--undo=false" is not on the list'],
  ['gh pr ready 35 --undo --undo=false', 'the flag "--undo=false" is not on the list'],
  ['gh pr ready 35 36 --undo', 'takes one pull request'],
  ['gh pr merge 35 --auto --merge', 'the author never merges'],
  ['gh pr merge 35 --disable-auto', 'the author never merges'],
  ['gh pr reopen 35', 'turns auto-merge on'],
  ['gh pr review 35 --approve', '"gh pr review" is not on the list'],
  ['gh pr update-branch 35', '"gh pr update-branch" is not on the list'],
  ['gh pr checkout 35', '"gh pr checkout" is not on the list'],
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
  ['(gh pr merge 35)', 'the author never merges'],
  ['Start-Job {gh pr merge 35}', 'an argument may not start with ( or {'],
  ['g^h pr merge 35', 'the author never merges'],
  ['gh.cmd pr merge 35', 'the author never merges'],
  ['C:\\tools\\gh.bat pr ready 35', 'only the owner marks'],
  ['{ gh pr ready 35; }', 'only the owner marks'],
  // The API may only read.
  ['gh api -X PUT repos/o/r/pulls/35/merge', 'gh api may only use GET'],
  ['gh api --method=POST repos/o/r/merges', 'gh api may only use GET'],
  ['gh api -X GET --method PUT repos/o/r/pulls/35/merge', 'gh api takes the method once'],
  ['gh api -X GET repos/{o}/x -X PUT', 'gh api takes the method once'],
  ['gh api repos/o/r/pulls/35/merge -f merge_method=merge', 'gh api may only read'],
  ['gh api repos/o/r/rulesets/1 --input rules.json', 'gh api may only read'],
  ['gh api repos/o/r/pulls -F draft=false', 'gh api may only read'],
  ['gh api graphql --jq .data', 'gh api graphql is not allowed'],
  ['gh api -XPUT repos/o/r/pulls/35/merge', 'gh api may only read'],
  ['gh api repos/o/r/a repos/o/r/b', 'exactly one endpoint'],
  // Brace expansion and PowerShell argument brackets run or expand before gh sees them.
  ['gh api repos/o/r/pulls/35/merge {-X,PUT}', 'an argument may not start with ( or {'],
  ['gh api repos/o/r/pulls/35/merge (echo -X PUT)', 'an argument may not start with ( or {'],
  ['gh pr ready 35 --undo {--undo=false,--undo=false}', 'an argument may not start with ( or {'],
  ['gh pr view 35 (gh pr merge 35)', 'an argument may not start with ( or {'],
  ['gh search (gh pr ready 35)', 'an argument may not start with ( or {'],
  ['gh pr comment 35 --body (gh pr ready 35)', 'an argument may not start with ( or {'],
  [
    'gh pr view 35 ([scriptblock]::Create("gh pr merge 35").Invoke())',
    'an argument may not start with ( or {',
  ],
  ['gh api --jq', '--jq needs a value'],
  // Other gh commands are on a short list, and never print the token.
  ['gh auth status --show-token', 'the flag "--show-token" is not on the list'],
  ['gh auth status -t', 'the flag "-t" is not on the list'],
  ['gh auth status --json hosts', 'the flag "--json" is not on the list'],
  ['gh auth token', '"gh auth token" is not on the list'],
  ['gh repo edit --enable-auto-merge', '"gh repo edit" is not on the list'],
  ['gh secret set AUTO_MERGE_TOKEN', '"gh secret" is not on the list'],
  ['gh alias set m "pr merge"', '"gh alias" is not on the list'],
  ['gh m 35', '"gh m" is not on the list'],
  ['gh run rerun 123', '"gh run rerun" is not on the list'],
  ['gh --repo o/r pr merge 35', '"gh --repo" is not on the list'],
  ['gh pr create --draft @args', 'no splatting'],
  // Variables, substitution and here-documents hide what runs.
  ['gh pr create --draft --title "$TITLE"', 'may not use $, backticks'],
  ['G=gh; $G pr merge 35', 'may not use $, backticks'],
  ["$g='gh'; & $g pr merge 35", 'may not use $, backticks'],
  ["$'gh' pr merge 35", 'may not use $, backticks'],
  ['35 | % {gh pr ready $_}', 'may not use $, backticks'],
  ['gh pr create --draft --body "$(cat body.md)"', 'may not use $, backticks'],
  ['gh pr `echo merge` 35', 'may not use $, backticks'],
  ['gh pr create --draft --body-file <(echo x)', 'may not use $, backticks, <(...)'],
  ['gh pr view 3 >(cat)', 'may not use $, backticks, <(...)'],
  ['gh pr create --draft --body-file - <<EOF', 'here-documents'],
  // gh anywhere but the program position cannot be judged, whatever runs it.
  ['bash -c "gh pr merge 35"', 'gh appears where it is not the program'],
  ['powershell -Command "gh pr merge 35"', 'gh appears where it is not the program'],
  ['Invoke-Expression "gh pr merge 35"', 'gh appears where it is not the program'],
  ['iex "gh pr ready 35"', 'gh appears where it is not the program'],
  ['env GH_REPO=o/r gh pr merge 35', 'gh appears where it is not the program'],
  ['command gh pr merge 35', 'gh appears where it is not the program'],
  ['echo 35 | xargs gh pr merge', 'gh appears where it is not the program'],
  [
    `node -e "require('child_process').execSync('gh pr merge 35')"`,
    'gh appears where it is not the program',
  ],
  ["git -c alias.m='!gh pr merge 35' m", 'gh appears where it is not the program'],
  ['ssh host "gh pr merge 35"', 'gh appears where it is not the program'],
  ['cmd /c g^h pr merge 35', 'gh appears where it is not the program'],
  ['if(gh pr merge 35){}', 'gh appears where it is not the program'],
  // Harmless, refused on purpose: the reason says what to do instead.
  ['git commit -m "chore(guard): refuse gh commands"', 'git commit -F <file>'],
  ['rg -n gh docs', 'search with the Grep tool'],
  ['Select-String -Pattern gh -Path CLAUDE.md', 'search with the Grep tool'],
  ['gh pr view "3', 'a quote is not closed'],
];

describe('commands that mention gh and are refused, with the reason', () => {
  it.each(REFUSALS)('%s', (command, reason) => {
    const verdict = decideCommand(command);
    expect(verdict).toMatchObject({ allow: false, judged: true });
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
    expect(verdict).toMatchObject({ allow: true, judged: false });
  });

  it('refuses a command it cannot read', () => {
    const verdict = decide({ tool_name: 'Bash', tool_input: {} });
    expect(verdict).toMatchObject({
      allow: false,
      reason: 'pr-guard: the command could not be read',
    });
  });
});
