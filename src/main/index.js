import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { join, resolve } from 'path'
import { existsSync, readFileSync } from 'fs'
import { createServer } from 'http'
import crypto from 'crypto'
import { simpleGit } from 'simple-git'
import Store from 'electron-store'
import axios from 'axios'

// Load .env (electron-vite lo carga en dev, esto cubre producción)
try {
  const envPath = resolve(app.getAppPath(), '.env')
  if (existsSync(envPath)) {
    readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
      const [k, ...v] = line.split('=')
      if (k && !k.startsWith('#') && v.length) process.env[k.trim()] = v.join('=').trim()
    })
  }
} catch { /* ignore */ }

const store = new Store()
let mainWindow
let oauthServer = null   // servidor HTTP temporal para el callback OAuth

// Puerto fijo para el callback — debe coincidir con el configurado en la GitHub OAuth App
const OAUTH_PORT = 42420
const OAUTH_REDIRECT = `http://localhost:${OAUTH_PORT}/callback`

// ── Single instance ───────────────────────────────────────────────────────────

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#1b1e2e',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── GitHub OAuth via localhost callback ───────────────────────────────────────

ipcMain.handle('auth:getCredentials', () => ({
  clientId: process.env.GITHUB_CLIENT_ID || store.get('githubClientId', ''),
  clientSecret: process.env.GITHUB_CLIENT_SECRET ? '***' : (store.get('githubClientSecret', '') ? '***' : ''),
  fromEnv: !!process.env.GITHUB_CLIENT_ID
}))

ipcMain.handle('auth:setCredentials', (_e, { clientId, clientSecret }) => {
  store.set('githubClientId', clientId)
  store.set('githubClientSecret', clientSecret)
})

ipcMain.handle('auth:getUser',  () => store.get('githubUser', null))
ipcMain.handle('auth:getToken', () => store.get('githubToken', null))

// Diagnóstico: devuelve el estado interno para mostrar en la UI
ipcMain.handle('auth:diagnose', () => ({
  hasClientId:     !!(process.env.GITHUB_CLIENT_ID || store.get('githubClientId', '')),
  hasClientSecret: !!(process.env.GITHUB_CLIENT_SECRET || store.get('githubClientSecret', '')),
  clientSecretIsPlaceholder: (process.env.GITHUB_CLIENT_SECRET || '').includes('PEGA_AQUI'),
  hasToken:        !!store.get('githubToken'),
  hasUser:         !!store.get('githubUser'),
  serverActive:    !!oauthServer,
  oauthPort:       OAUTH_PORT,
  redirectUri:     OAUTH_REDIRECT,
}))

ipcMain.handle('auth:login', async () => {
  const clientId = process.env.GITHUB_CLIENT_ID || store.get('githubClientId', '')
  if (!clientId) return { error: 'no_credentials' }

  // Levanta el servidor HTTP de callback (si no está ya corriendo)
  startOAuthCallbackServer()

  const authUrl =
    `https://github.com/login/oauth/authorize` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&scope=repo,user` +
    `&redirect_uri=${encodeURIComponent(OAUTH_REDIRECT)}`

  shell.openExternal(authUrl)
})

ipcMain.handle('auth:logout', () => {
  store.delete('githubToken')
  store.delete('githubUser')
})

function startOAuthCallbackServer() {
  if (oauthServer) return   // ya está escuchando

  oauthServer = createServer((req, res) => {
    console.log('[OAuth] Incoming request:', req.url)

    if (!req.url?.startsWith('/callback')) {
      res.writeHead(404)
      res.end()
      return
    }

    const url  = new URL(`http://localhost${req.url}`)
    const code = url.searchParams.get('code')
    const err  = url.searchParams.get('error')

    console.log('[OAuth] code:', code ? code.substring(0, 8) + '...' : 'none', '| error:', err)

    // Responde al browser con una página de cierre amigable
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(`<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>GitVisual — Auth</title>
<style>
  body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;
       background:#1b1e2e;color:#d1d5e0;font-family:'Inter',-apple-system,sans-serif}
  .card{text-align:center;padding:2rem;border-radius:1rem;background:#252a3a;
        border:1px solid #2d3348;max-width:400px}
  h2{margin:0 0 .5rem;font-size:1.25rem}
  p{color:#94a3b8;margin:0;font-size:.9rem}
  .icon{font-size:2.5rem;margin-bottom:1rem}
</style></head>
<body>
  <div class="card">
    <div class="icon">${err ? '❌' : '✅'}</div>
    <h2>${err ? 'Error de autenticación' : '¡Autenticado correctamente!'}</h2>
    <p>${err ? err : 'Puedes cerrar esta pestaña y volver a GitVisual.'}</p>
  </div>
</body></html>`)

    // Cierra el servidor después de responder
    setImmediate(() => {
      oauthServer?.close()
      oauthServer = null
    })

    if (code) {
      handleOAuthCode(code)
    } else if (err) {
      mainWindow?.webContents.send('auth:error', `GitHub rechazó el acceso: ${err}`)
    }
  })

  oauthServer.on('error', e => {
    console.error('[OAuth] Server error:', e.message)
    mainWindow?.webContents.send('auth:error', `Error servidor OAuth (puerto ${OAUTH_PORT}): ${e.message}`)
  })

  // Escucha en TODAS las interfaces (IPv4 + IPv6) para que funcione
  // tanto con localhost→127.0.0.1 como localhost→::1 según el SO
  oauthServer.listen(OAUTH_PORT, () => {
    const addr = oauthServer.address()
    console.log(`[OAuth] Callback server listening on port ${addr?.port}`)
  })
}

async function handleOAuthCode(code) {
  try {
    const clientId     = process.env.GITHUB_CLIENT_ID     || store.get('githubClientId', '')
    const clientSecret = process.env.GITHUB_CLIENT_SECRET || store.get('githubClientSecret', '')

    console.log('[OAuth] Exchanging code for token. clientId:', clientId, '| hasSecret:', !!clientSecret)

    if (!clientSecret) {
      throw new Error('Client Secret no configurado. Actualiza tu .env con GITHUB_CLIENT_SECRET.')
    }

    // NO enviamos redirect_uri en el intercambio — GitHub lo acepta sin él
    // y es más seguro para evitar discrepancias de URL
    const tokenRes = await axios.post(
      'https://github.com/login/oauth/access_token',
      { client_id: clientId, client_secret: clientSecret, code },
      { headers: { Accept: 'application/json' } }
    )

    console.log('[OAuth] Token response:', JSON.stringify(tokenRes.data))

    const token = tokenRes.data.access_token
    if (!token) {
      const msg = tokenRes.data.error_description || tokenRes.data.error || JSON.stringify(tokenRes.data)
      throw new Error(`GitHub no devolvió token: ${msg}`)
    }

    store.set('githubToken', token)

    const userRes = await axios.get('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}` }
    })

    console.log('[OAuth] Logged in as:', userRes.data.login)
    store.set('githubUser', userRes.data)

    // Trae la ventana al frente y notifica al renderer
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
      if (mainWindow.isMinimized()) mainWindow.restore()
    }
    mainWindow?.webContents.send('auth:success', userRes.data)
  } catch (err) {
    mainWindow?.webContents.send('auth:error', err.message)
  }
}

// ── Dialog ────────────────────────────────────────────────────────────────────

ipcMain.handle('dialog:openFolder', async () => {
  const { filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Selecciona un repositorio Git'
  })
  return filePaths[0] ?? null
})

// ── Git operations ────────────────────────────────────────────────────────────

ipcMain.handle('git:validateRepo', (_e, folderPath) => {
  return existsSync(join(folderPath, '.git'))
})

ipcMain.handle('git:getLog', async (_e, folderPath) => {
  const git = simpleGit(folderPath)

  const raw = await git.raw([
    'log',
    '--all',
    '--date-order',
    '--format=%x00%H%x01%P%x01%an%x01%ae%x01%aI%x01%s%x01%D',
    '--date=iso-strict',
    '--shortstat'
  ])

  const commits = parseGitLog(raw)
  const branchInfo = await git.branch(['-a'])

  return {
    commits,
    branches: branchInfo.all,
    currentBranch: branchInfo.current
  }
})

ipcMain.handle('git:getCommitDetail', async (_e, { folderPath, hash }) => {
  const git = simpleGit(folderPath)

  const isRange = hash.includes('..')

  // If oldest^..newest fails (e.g. oldest is initial commit), we can just try catching and fallback.
  // But simpleGit throws if command fails. We'll handle it outside if we want, or just let it fail.
  // We'll use raw commands depending on if it's a range.
  const getRaw = async (cmdRange, cmdSingle) => {
    try {
      return await git.raw(isRange ? cmdRange : cmdSingle)
    } catch (err) {
      if (isRange && err.message.includes('bad revision')) {
        // Fallback for initial commit parent failure: compare empty tree to newest
        const newest = hash.split('..')[1] || hash
        const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
        const fallbackCmd = cmdRange.map(a => a === hash ? `${EMPTY_TREE}..${newest}` : a)
        return await git.raw(fallbackCmd)
      }
      throw err
    }
  }

  const [metadata, nameStatus, numstat, diff] = await Promise.all([
    isRange 
      ? Promise.resolve(`${hash}\nMulti\nmulti@example.com\n\nSelección múltiple: Diff combinado`) 
      : git.raw(['show', '--format=%H%n%an%n%ae%n%aI%n%B', '-s', hash]),
    getRaw(['diff', '--name-status', hash], ['show', '--name-status', '--format=', hash]),
    getRaw(['diff', '--numstat', hash], ['show', '--numstat', '--format=', hash]),
    getRaw(['diff', '--unified=3', hash], ['show', '--unified=3', hash])
  ])

  const filesMap = new Map()
  nameStatus.trim().split('\n').filter(Boolean).forEach(line => {
    const parts = line.split('\t')
    const status = parts[0][0] // A, M, D, R
    const file = parts[parts.length - 1]
    filesMap.set(file, { file, status, adds: 0, dels: 0 })
  })

  numstat.trim().split('\n').filter(Boolean).forEach(line => {
    const parts = line.split('\t')
    if (parts.length >= 3) {
      const file = parts[parts.length - 1]
      if (filesMap.has(file)) {
        const obj = filesMap.get(file)
        obj.adds = parseInt(parts[0], 10) || 0
        obj.dels = parseInt(parts[1], 10) || 0
      }
    }
  })

  return { metadata, files: Array.from(filesMap.values()), diff }
})

ipcMain.handle('git:getCommitStats', async (_e, { folderPath, hash }) => {
  const git = simpleGit(folderPath)
  try {
    const stat = await git.raw(['show', '--shortstat', '--format=', hash])
    // output example: " 3 files changed, 45 insertions(+), 1 deletion(-)"
    const numstat = await git.raw(['show', '--numstat', '--format=', hash])
    
    const lines = numstat.trim().split('\n').filter(Boolean)
    const files = lines.length
    let insertions = 0
    let deletions = 0

    for (const line of lines) {
      const [add, del] = line.split('\t')
      if (add !== '-') insertions += parseInt(add, 10) || 0
      if (del !== '-') deletions += parseInt(del, 10) || 0
    }

    return { files, insertions, deletions, raw: stat.trim() }
  } catch {
    return null
  }
})

ipcMain.handle('git:getBranches', async (_e, folderPath) => {
  const git = simpleGit(folderPath)
  return git.branch(['-a'])
})

ipcMain.handle('git:checkout', async (_e, { folderPath, branch }) => {
  const git = simpleGit(folderPath)

  // Para ramas remotas (remotes/origin/feature) hacemos tracking local
  const isRemote = branch.startsWith('remotes/')
  const localName = isRemote
    ? branch.replace(/^remotes\/[^/]+\//, '')   // "remotes/origin/feat" → "feat"
    : branch

  try {
    if (isRemote) {
      // Intenta checkout local primero; si no existe crea tracking branch
      const local = await git.branch([])
      const exists = local.all.includes(localName)
      if (exists) {
        await git.checkout(localName)
      } else {
        await git.checkoutBranch(localName, branch)
      }
    } else {
      await git.checkout(localName)
    }
    return { ok: true, branch: localName }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('git:createBranch', async (_e, { folderPath, branchName, hash }) => {
  try {
    const git = simpleGit(folderPath)
    await git.checkoutBranch(branchName, hash)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('git:merge', async (_e, { folderPath, target }) => {
  try {
    const git = simpleGit(folderPath)
    await git.merge([target])
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('git:rebase', async (_e, { folderPath, target }) => {
  try {
    const git = simpleGit(folderPath)
    await git.rebase([target])
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('git:getStatus', async (_e, folderPath) => {
  try {
    const git = simpleGit(folderPath)
    const s = await git.status()
    // Serialize to a plain object — simple-git returns a class instance that Electron cannot clone
    const status = {
      current:    s.current    || '',
      tracking:   s.tracking   || '',
      ahead:      s.ahead      || 0,
      behind:     s.behind     || 0,
      staged:     Array.from(s.staged    || []),
      modified:   Array.from(s.modified  || []),
      created:    Array.from(s.created   || []),
      deleted:    Array.from(s.deleted   || []),
      renamed:    Array.from(s.renamed   || []).map(r => ({ from: r.from, to: r.to })),
      not_added:  Array.from(s.not_added || []),
      conflicted: Array.from(s.conflicted || []),
      isClean:    s.isClean ? s.isClean() : (s.files && s.files.length === 0),
    }
    return { ok: true, status }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('git:getTags', async (_e, folderPath) => {
  try {
    const git = simpleGit(folderPath)
    const result = await git.tags()
    return { ok: true, tags: result.all }
  } catch (err) {
    return { ok: false, error: err.message, tags: [] }
  }
})

ipcMain.handle('git:getStashes', async (_e, folderPath) => {
  try {
    const git = simpleGit(folderPath)
    const raw = await git.raw(['stash', 'list', '--format=%gd|%s|%aI'])
    const stashes = raw
      .split('\n')
      .filter(Boolean)
      .map((line, idx) => {
        const [ref, message, date] = line.split('|')
        return { ref: ref?.trim() || `stash@{${idx}}`, message: message?.trim() || '', date: date?.trim() || '', index: idx }
      })
    return { ok: true, stashes }
  } catch (err) {
    return { ok: false, error: err.message, stashes: [] }
  }
})

ipcMain.handle('git:stashSave', async (_e, { folderPath, message }) => {
  try {
    const git = simpleGit(folderPath)
    const args = message ? ['push', '-m', message] : ['push']
    await git.stash(args)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('git:stashPop', async (_e, { folderPath, ref }) => {
  try {
    const git = simpleGit(folderPath)
    await git.stash(['pop', ref || 'stash@{0}'])
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('git:stashDrop', async (_e, { folderPath, ref }) => {
  try {
    const git = simpleGit(folderPath)
    await git.stash(['drop', ref || 'stash@{0}'])
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('git:stage', async (_e, { folderPath, files }) => {
  try {
    const git = simpleGit(folderPath)
    await git.add(files)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('git:unstage', async (_e, { folderPath, files }) => {
  try {
    const git = simpleGit(folderPath)
    await git.raw(['reset', 'HEAD', '--', ...files])
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('git:commit', async (_e, { folderPath, summary, description }) => {
  try {
    const git = simpleGit(folderPath)
    const msg = description ? `${summary}\n\n${description}` : summary
    await git.commit(msg)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('git:reset', async (_e, { folderPath, mode, hash }) => {
  try {
    const git = simpleGit(folderPath)
    await git.reset([`--${mode}`, hash])
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('git:cherryPick', async (_e, { folderPath, hash }) => {
  try {
    const git = simpleGit(folderPath)
    await git.raw(['cherry-pick', hash])
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('git:pull', async (_e, folderPath) => {
  try {
    const git = simpleGit(folderPath)
    const result = await git.pull()
    return { ok: true, result }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('git:push', async (_e, { folderPath, force }) => {
  try {
    const git = simpleGit(folderPath)
    const args = force ? ['--force'] : []
    const result = await git.push(args)
    return { ok: true, result }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('git:getFileDiff', async (_e, { folderPath, file, cached, commitHash }) => {
  try {
    const git = simpleGit(folderPath)
    let diff
    if (commitHash && commitHash !== 'WIP') {
      // diff for a specific historical commit file
      const range = commitHash.includes('..') ? commitHash : `${commitHash}^..${commitHash}`
      diff = await git.raw(['diff', '--unified=3', range, '--', file])
    } else {
      const args = ['diff', '--unified=3']
      if (cached) args.push('--cached')
      args.push('--', file)
      diff = await git.raw(args)
    }
    return { ok: true, diff }
  } catch (err) {
    return { ok: false, error: err.message, diff: '' }
  }
})

ipcMain.handle('git:pullRebase', async (_e, folderPath) => {
  try {
    const git = simpleGit(folderPath)
    const result = await git.pull(['--rebase'])
    return { ok: true, result: String(result) }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('git:abortMerge', async (_e, folderPath) => {
  try {
    const git = simpleGit(folderPath)
    await git.merge(['--abort'])
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('git:abortRebase', async (_e, folderPath) => {
  try {
    const git = simpleGit(folderPath)
    await git.rebase(['--abort'])
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('git:abortCherryPick', async (_e, folderPath) => {
  try {
    const git = simpleGit(folderPath)
    await git.raw(['cherry-pick', '--abort'])
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// ── Persisted repo list ───────────────────────────────────────────────────────


ipcMain.handle('store:getRepos', () => store.get('repositories', []))

ipcMain.handle('store:addRepo', (_e, repoPath) => {
  const repos = store.get('repositories', []).filter(r => r !== repoPath)
  repos.unshift(repoPath)
  store.set('repositories', repos.slice(0, 20))
  return store.get('repositories')
})

ipcMain.handle('store:removeRepo', (_e, repoPath) => {
  const repos = store.get('repositories', []).filter(r => r !== repoPath)
  store.set('repositories', repos)
  return repos
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseGitLog(raw) {
  return raw
    .split('\x00')
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(entry => {
      const parts = entry.split('\n')
      const metadata = parts[0]
      const statLine = parts.length > 1 ? parts[1].trim() : ''

      const [hash, parentsRaw, authorName, authorEmail, date, subject, refsRaw] =
        metadata.split('\x01')

      let insertions = 0
      let deletions = 0
      if (statLine) {
        const insMatch = statLine.match(/(\d+)\s+insertion/)
        const delMatch = statLine.match(/(\d+)\s+deletion/)
        if (insMatch) insertions = parseInt(insMatch[1], 10)
        if (delMatch) deletions = parseInt(delMatch[1], 10)
      }

      const parents = parentsRaw?.trim() ? parentsRaw.trim().split(' ') : []
      const refs    = refsRaw?.trim() ?? ''

      const branches = []
      const tags     = []
      let isHead     = false
      let headBranch = ''

      if (refs) {
        refs.split(',').forEach(r => {
          const t = r.trim()
          if (t.startsWith('HEAD ->')) {
            isHead = true
            headBranch = t.replace('HEAD -> ', '').trim()
            branches.push(headBranch)
          } else if (t === 'HEAD') {
            isHead = true
          } else if (t.startsWith('tag:')) {
            tags.push(t.replace('tag: ', ''))
          } else if (t) {
            branches.push(t)
          }
        })
      }

      let md5 = ''
      if (authorEmail) {
        md5 = crypto.createHash('md5').update(authorEmail.trim().toLowerCase()).digest('hex')
      }

      return {
        hash,
        shortHash: hash?.substring(0, 7) ?? '',
        parents,
        authorName:  authorName?.trim() ?? '',
        authorEmail: authorEmail?.trim() ?? '',
        authorAvatar: md5 ? `https://www.gravatar.com/avatar/${md5}?d=identicon&s=40` : '',
        date:        date?.trim()        ?? '',
        subject:     subject?.trim()     ?? '',
        insertions,
        deletions,
        refs,
        branches,
        tags,
        isHead,
        headBranch
      }
    })
    .filter(c => c.hash)

  const stashIndexHashes = new Set()
  parsed.forEach(c => {
    // Identify stash commits (they typically have 'refs/stash' or start with 'WIP on ' or 'On <branch>:')
    if (c.branches.some(b => b.includes('refs/stash')) || c.tags.some(t => t.includes('refs/stash')) || c.refs.includes('refs/stash')) {
      // Stash commits have 2 or 3 parents: [0] base commit, [1] index commit, [2] untracked files
      if (c.parents.length >= 2) stashIndexHashes.add(c.parents[1])
      if (c.parents.length >= 3) stashIndexHashes.add(c.parents[2])
      
      // Remove index/untracked parents so the graph layout doesn't draw infinite lines
      c.parents = [c.parents[0]].filter(Boolean)
    }
  })

  return parsed.filter(c => !stashIndexHashes.has(c.hash))
}

ipcMain.handle('system:openInVSCode', async (_e, folderPath) => {
  const { exec } = require('child_process')
  return new Promise((resolve) => {
    exec('code .', { cwd: folderPath }, (error) => {
      if (error) {
        resolve({ ok: false, error: error.message })
      } else {
        resolve({ ok: true })
      }
    })
  })
})
