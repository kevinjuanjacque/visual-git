# Git workflows test plan

## Application overview

GitVisual renders local Git repositories in Electron. The E2E suite launches the compiled
application with a fictitious local user and temporary repositories, so it exercises the IPC
layer and the UI without credentials, network access, or a developer's repositories.

## Test scenarios

### 1. Navigation and filters

**Seed:** `tests/e2e/git-workflows.spec.js`

#### 1.1. filter-open-repositories-and-branches

**File:** `tests/e2e/git-workflows.spec.js`

**Steps:**
1. Type an opened repository name in the repository filter.
   - expect: only matching repositories are shown.
2. Clear the repository filter and type a branch name in the branch filter.
   - expect: only the matching local branch is shown.

### 2. Common Git actions

**Seed:** `tests/e2e/git-workflows.spec.js`

#### 2.1. create-a-commit

**File:** `tests/e2e/git-workflows.spec.js`

**Steps:**
1. Add a working-tree file and select the WIP node.
   - expect: the staging panel is shown.
2. Stage the file, enter a Conventional Commit subject, and commit.
   - expect: the new commit is rendered in the graph.

#### 2.2. checkout-a-branch

**File:** `tests/e2e/git-workflows.spec.js`

**Steps:**
1. Double-click a local branch in the sidebar.
   - expect: it is marked as the current branch.

#### 2.3. checkout-a-remote-branch

**File:** `tests/e2e/git-workflows.spec.js`

**Steps:**
1. Double-click a remote-only branch in the sidebar.
   - expect: a local tracking branch is checked out instead of a detached HEAD.

#### 2.4. merge-into-current-branch

**File:** `tests/e2e/git-workflows.spec.js`

**Steps:**
1. Open the contextual menu for a feature commit and choose merge into the current branch.
   - expect: the feature branch becomes reachable from the current branch.

#### 2.5. rebase-current-branch

**File:** `tests/e2e/git-workflows.spec.js`

**Steps:**
1. Open the contextual menu for a feature commit and rebase the current branch onto it.
   - expect: the feature branch becomes an ancestor of the current branch.

#### 2.6. cherry-pick-and-revert

**File:** `tests/e2e/git-workflows.spec.js`

**Steps:**
1. Cherry-pick a feature commit into the current branch.
   - expect: the feature commit content is present in the current branch.
2. Revert a selected current-branch commit.
   - expect: Git creates a revert commit.
