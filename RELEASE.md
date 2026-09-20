# Release checklist

Nothing has been pushed or published. This repository is staged locally. Run these yourself, in order, after trademark clearance for the name.

## 0. The public repository is a separate build, not this working tree

This working tree carries a personal commit identity on every object (`git log --format='%ae'` prints one address on every commit), and `package.json` names a different author from the one on the commits. Publishing this tree would publish both.

So the public repository is **built**, not pushed. Export the tree with `git archive` into a directory outside this one, initialise a repository there, and make one commit under a noreply identity:

```
mkdir -p ../tells-public && git archive HEAD | tar -x -C ../tells-public
cd ../tells-public
git init -b main
git config user.name "Jarred O'Brien"
git config user.email "<your-github-id>+<your-github-handle>@users.noreply.github.com"
git add -A
git commit -m "tells 0.1.0"
```

`git archive HEAD` exports exactly the tracked files at HEAD: no history, no `.git`, nothing ignored. Check what came out before going on:

```
git -C ../tells-public status --short             # must print nothing
git -C ../tells-public log --format='%an <%ae>'   # must print only the noreply identity
```

Nothing in this checklist runs `git push` from this working tree, and none of the commands in steps 3 to 6 is run here.

## 1. Check the names are still free

```
npm view tells name
```

On 2026-09-19 this returned E404 (`'tells@*' is not in this registry`), meaning the name was unclaimed that day. If it returns a package, stop and pick another name before going further: the README, package.json, SKILL.md and the CLI help all use it.

Check that `https://github.com/CandyFlex/tells` does not already exist.

## 2. Verify the tree, here, before exporting

```
git status --short
npm test
npm run check-docs-sync
npm run check-docs-data
node scripts/build-readme.mjs --check
node scripts/ascii-source.mjs --check README.md SKILL.md AGENTS.md CHANGELOG.md RELEASE.md bin/tells.mjs
npm pack --dry-run
```

`git status` must print nothing. `npm pack --dry-run` must list only `src/`, `bin/`, `README.md`, `LICENSE` and `package.json`. No corpus, studies, docs, scripts or tests may appear. Every one of these commands also runs in CI on node 20 and 22, so a green CI run on the commit you are exporting is the same check.

## 3. Create the GitHub repository from the exported copy

```
cd ../tells-public
gh repo create CandyFlex/tells --public --source . --remote origin --description "A linter for prose that reads as machine-written. Counts and line numbers, not a verdict."
git push -u origin main
```

## 4. GitHub Pages

The showcase page is in `docs/` and is committed (`docs/index.html`, `docs/style.css`, `docs/app.mjs`, generated `docs/data.js`, the synced `docs/lib/` and the vendored fonts). In the repository settings, set Pages to deploy from the `main` branch, folder `/docs`. Then open the published URL and confirm the browser console is empty and the network panel shows no request to another origin.

## 5. Tag and publish

```
git tag v0.1.0
git push origin v0.1.0
npm publish --access public
```

`npm publish` is run in `../tells-public`, from the same tree the tag points at.

## 6. After publishing

```
npx tells@0.1.0 --version
```

Then edit the README sentence that says the package is not published yet. Make that edit **here**, in this working tree, and rebuild the public copy from step 0. The exported directory is disposable and is never edited by hand.

## What is deliberately not here

No announcement copy, no badges, no star or download counts. If the README ever shows a number, it comes from a script in `scripts/`.
