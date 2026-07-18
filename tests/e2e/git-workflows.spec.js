import { test as base, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { execFile as execFileCallback } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFile = promisify(execFileCallback)

async function git(cwd, ...args) {
  return execFile('git', args, { cwd })
}

async function createRepository(root, name) {
  const repository = join(root, name)
  const remoteRepository = join(root, `${name}-origin.git`)
  await mkdir(repository)
  await git(repository, 'init', '--initial-branch=main')
  await git(repository, 'config', 'user.name', 'Playwright')
  await git(repository, 'config', 'user.email', 'playwright@example.test')
  await writeFile(join(repository, 'README.md'), '# Visual Git E2E\n')
  await git(repository, 'add', 'README.md')
  await git(repository, 'commit', '-m', 'chore: initial commit')
  await git(root, 'init', '--bare', remoteRepository)
  await git(repository, 'remote', 'add', 'origin', remoteRepository)
  await git(repository, 'push', '-u', 'origin', 'main')
  return repository
}

async function createFeatureBranch(repository, name, subject) {
  await git(repository, 'checkout', '-b', name)
  const filename = `${name.replaceAll('/', '-')}.txt`
  await writeFile(join(repository, filename), `${subject}\n`)
  await git(repository, 'add', filename)
  await git(repository, 'commit', '-m', subject)
  await git(repository, 'checkout', 'main')
}

async function commitMainChange(repository) {
  await writeFile(join(repository, 'main.txt'), 'main branch change\n')
  await git(repository, 'add', 'main.txt')
  await git(repository, 'commit', '-m', 'chore: main latest')
}

async function createRemoteOnlyBranch(repository, name, subject) {
  await createFeatureBranch(repository, name, subject)
  await git(repository, 'push', '-u', 'origin', name)
  await git(repository, 'branch', '-D', name)
}

async function isAncestor(repository, ancestor, descendant) {
  try {
    await git(repository, 'merge-base', '--is-ancestor', ancestor, descendant)
    return true
  } catch {
    return false
  }
}

async function createDeviceFlowServer(accounts = [{
  token: 'device-flow-test-token',
  user: {
    id: 100,
    login: 'device-flow-user',
    name: 'Device Flow User',
    email: 'device-flow-user@example.test',
    avatar_url: ''
  }
}]) {
  let authorizationCount = 0
  let tokenRequestCount = 0

  const server = createServer((request, response) => {
    const sendJson = body => {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(body))
    }

    if (request.url === '/login/device/code') {
      const accountIndex = Math.min(authorizationCount++, accounts.length - 1)
      sendJson({
        device_code: `device-code-for-test-${accountIndex}`,
        user_code: accountIndex === 0 ? 'ABCD-EFGH' : 'IJKL-MNOP',
        verification_uri: 'https://github.com/login/device',
        expires_in: 900,
        interval: 1
      })
      return
    }
    if (request.url === '/login/oauth/access_token') {
      const account = accounts[Math.min(tokenRequestCount++, accounts.length - 1)]
      sendJson({ access_token: account.token })
      return
    }
    if (request.url === '/user') {
      const account = accounts.find(candidate => request.headers.authorization === `Bearer ${candidate.token}`)
      sendJson(account?.user ?? accounts[0].user)
      return
    }

    response.writeHead(404)
    response.end()
  })

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise(resolve => server.close(resolve))
  }
}

const test = base.extend({
  workspace: async ({}, use) => {
    const root = await mkdtemp(join(tmpdir(), 'visual-git-e2e-'))
    const primaryRepository = await createRepository(root, 'alpha-repository')
    const secondaryRepository = await createRepository(root, 'beta-repository')

    await createFeatureBranch(primaryRepository, 'feature/checkout', 'feat: checkout branch')
    await createFeatureBranch(primaryRepository, 'feature/merge', 'feat: merge branch')
    await createFeatureBranch(primaryRepository, 'feature/rebase', 'feat: rebase branch')
    await createFeatureBranch(primaryRepository, 'feature/cherry', 'feat: cherry branch')
    await createRemoteOnlyBranch(primaryRepository, 'feature/remote-checkout', 'feat: remote checkout branch')
    await commitMainChange(primaryRepository)

    await use({ root, primaryRepository, secondaryRepository })
    await rm(root, { recursive: true, force: true })
  },

  app: async ({ workspace }, use) => {
    const app = await electron.launch({
      args: ['.'],
      env: {
        ...process.env,
        GITVISUAL_E2E: '1',
        GITVISUAL_E2E_REPOS: JSON.stringify([workspace.primaryRepository, workspace.secondaryRepository]),
        GITVISUAL_E2E_STORE: join(workspace.root, 'electron-store')
      }
    })

    await use(app)
    await app.close()
  },

  page: async ({ app }, use) => {
    const page = await app.firstWindow()
    await expect(page.getByText('Visual Git', { exact: true })).toBeVisible()
    await expect(page.getByRole('complementary').getByRole('button', { name: /alpha-repository/ })).toBeVisible()
    await use(page)
  }
})

test('filter-open-repositories-and-branches', async ({ page }) => {
  const sidebar = page.getByRole('complementary')
  const repositoryFilter = page.getByRole('searchbox', { name: 'Filtrar repositorios abiertos', exact: true })
  await repositoryFilter.fill('beta')
  await expect(sidebar.getByRole('button', { name: /beta-repository/ })).toBeVisible()
  await expect(sidebar.getByRole('button', { name: /alpha-repository/ })).not.toBeVisible()

  await repositoryFilter.fill('')
  await expect(sidebar.getByText('feature/merge', { exact: true })).toBeVisible()
  const branchFilter = page.getByRole('searchbox', { name: 'Filtrar ramas', exact: true })
  await branchFilter.fill('feature/merge')
  await expect(sidebar.getByText('feature/merge', { exact: true })).toBeVisible()
  await expect(sidebar.getByText('feature/rebase', { exact: true })).not.toBeVisible()
})

test('captures the real application dashboard for the landing page', async ({ page }, testInfo) => {
  await expect(page.getByText('feat: cherry branch', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('visual-git-dashboard.png') })
})

test('create-a-commit', async ({ page, workspace }) => {
  await writeFile(join(workspace.primaryRepository, 'work-in-progress.txt'), 'new work\n')
  const wipCommit = page.getByText(/\/\/ WIP/)
  await expect(wipCommit).toBeVisible({ timeout: 10_000 })
  await wipCommit.first().click()
  await page.getByRole('button', { name: 'Stage All' }).click()
  await page.getByLabel('Asunto del commit').fill('create playwright commit')
  await page.getByRole('button', { name: 'Commit' }).click()

  await expect(page.getByText('feat: create playwright commit', { exact: true })).toBeVisible()
})

test('checkout-a-branch', async ({ page }) => {
  const sidebar = page.getByRole('complementary')
  await sidebar.getByText('feature/checkout', { exact: true }).dblclick()
  await expect(sidebar.getByTitle('Rama actual')).toContainText('feature/checkout')
})

test('checkout-a-remote-branch', async ({ page, workspace }) => {
  const sidebar = page.getByRole('complementary')
  await sidebar.getByText('feature/remote-checkout', { exact: true }).dblclick()
  await expect(sidebar.getByTitle('Rama actual')).toContainText('feature/remote-checkout')
  await expect.poll(async () => {
    const { stdout } = await git(workspace.primaryRepository, 'branch', '--show-current')
    return stdout.trim()
  }).toBe('feature/remote-checkout')
})

test('merge-into-current-branch', async ({ page, workspace }) => {
  await page.getByText('feat: merge branch', { exact: true }).click({ button: 'right' })
  await page.getByText(/^Merge .* en actual$/).click()

  await expect.poll(() => isAncestor(workspace.primaryRepository, 'feature/merge', 'main')).toBe(true)
})

test('rebase-current-branch', async ({ page, workspace }) => {
  await page.getByText('feat: rebase branch', { exact: true }).click({ button: 'right' })
  await page.getByText(/^Rebase actual sobre /).click()

  await expect.poll(() => isAncestor(workspace.primaryRepository, 'feature/rebase', 'main')).toBe(true)
})

test('cherry-pick-and-revert', async ({ page, workspace }) => {
  await page.getByText('feat: cherry branch', { exact: true }).click({ button: 'right' })
  await page.getByText('Cherry-pick a rama actual').click()
  await expect.poll(async () => {
    const { stdout } = await git(workspace.primaryRepository, 'log', '-1', '--format=%s')
    return stdout.trim()
  }).toBe('feat: cherry branch')

  await page.getByText('feat: cherry branch', { exact: true }).click({ button: 'right' })
  await page.getByText('Revertir este commit').click()
  await expect.poll(async () => {
    const { stdout } = await git(workspace.primaryRepository, 'log', '-1', '--format=%s')
    return stdout.trim()
  }).toBe('Revert "feat: cherry branch"')
})

test('authenticates using GitHub Device Flow', async () => {
  const mockGitHub = await createDeviceFlowServer()
  const storePath = await mkdtemp(join(tmpdir(), 'visual-git-auth-e2e-'))
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      GITHUB_OAUTH_BASE_URL: mockGitHub.url,
      GITHUB_API_BASE_URL: mockGitHub.url,
      GITVISUAL_E2E_STORE: storePath,
      GITVISUAL_TEST_DISABLE_OPEN_EXTERNAL: '1'
    }
  })

  try {
    const page = await app.firstWindow()
    await page.getByRole('button', { name: 'Iniciar sesión con GitHub' }).click()
    await expect(page.getByText('ABCD-EFGH', { exact: true })).toBeVisible()
    await expect(page.getByText('device-flow-user', { exact: true })).toBeVisible({ timeout: 10_000 })
  } finally {
    await app.close()
    await mockGitHub.close()
    await rm(storePath, { recursive: true, force: true })
  }
})

test('switches GitHub accounts and commits with the selected author', async ({ workspace }) => {
  const mockGitHub = await createDeviceFlowServer([
    {
      token: 'first-account-token',
      user: {
        id: 101,
        login: 'first-account',
        name: 'First Account',
        email: 'first-account@example.test',
        avatar_url: ''
      }
    },
    {
      token: 'second-account-token',
      user: {
        id: 102,
        login: 'second-account',
        name: 'Second Account',
        email: 'second-account@example.test',
        avatar_url: ''
      }
    }
  ])
  const storePath = await mkdtemp(join(tmpdir(), 'visual-git-accounts-e2e-'))
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      GITHUB_OAUTH_BASE_URL: mockGitHub.url,
      GITHUB_API_BASE_URL: mockGitHub.url,
      GITVISUAL_E2E: '1',
      GITVISUAL_E2E_SKIP_AUTH: '1',
      GITVISUAL_E2E_REPOS: JSON.stringify([workspace.primaryRepository]),
      GITVISUAL_E2E_STORE: storePath,
      GITVISUAL_TEST_DISABLE_OPEN_EXTERNAL: '1'
    }
  })

  try {
    const page = await app.firstWindow()
    await page.getByRole('button', { name: 'Iniciar sesión con GitHub' }).click()
    await expect(page.getByText('ABCD-EFGH', { exact: true })).toBeVisible()
    await expect(page.getByText('first-account', { exact: true })).toBeVisible({ timeout: 10_000 })

    await page.getByRole('button', { name: 'Cambiar cuenta de GitHub' }).click()
    await page.getByRole('menuitem', { name: /Añadir cuenta de GitHub/ }).click()
    await expect(page.getByText('IJKL-MNOP', { exact: true })).toBeVisible()
    await expect(page.getByText('second-account', { exact: true })).toBeVisible({ timeout: 10_000 })

    await page.getByRole('button', { name: 'Cambiar cuenta de GitHub' }).click()
    await page.getByRole('menuitem', { name: /first-account/ }).click()
    await expect(page.getByRole('button', { name: 'Cambiar cuenta de GitHub' })).toContainText('first-account')

    await page.getByRole('button', { name: 'Cambiar cuenta de GitHub' }).click()
    await page.getByRole('menuitem', { name: /second-account/ }).click()

    await writeFile(join(workspace.primaryRepository, 'selected-account.txt'), 'commit with selected account\n')
    const wipCommit = page.getByText(/\/\/ WIP/)
    await expect(wipCommit).toBeVisible({ timeout: 10_000 })
    await wipCommit.first().click()
    await page.getByRole('button', { name: 'Stage All' }).click()
    await page.getByLabel('Asunto del commit').fill('commit with selected account')
    await page.getByRole('button', { name: 'Commit' }).click()

    await expect.poll(async () => {
      const { stdout } = await git(workspace.primaryRepository, 'log', '-1', '--format=%an|%ae')
      return stdout.trim()
    }).toBe('Second Account|second-account@example.test')
  } finally {
    await app.close()
    await mockGitHub.close()
    await rm(storePath, { recursive: true, force: true })
  }
})
