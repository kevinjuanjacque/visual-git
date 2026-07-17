import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Auth ──────────────────────────────────────────────────────────────────
  getCredentials: ()              => ipcRenderer.invoke('auth:getCredentials'),
  setCredentials: (creds)        => ipcRenderer.invoke('auth:setCredentials', creds),
  getUser:        ()              => ipcRenderer.invoke('auth:getUser'),
  getToken:       ()              => ipcRenderer.invoke('auth:getToken'),
  diagnose:       ()              => ipcRenderer.invoke('auth:diagnose'),
  login:          ()              => ipcRenderer.invoke('auth:login'),
  logout:         ()              => ipcRenderer.invoke('auth:logout'),

  onAuthSuccess: (cb) => {
    const listener = (_e, user) => cb(user)
    ipcRenderer.on('auth:success', listener)
    return () => ipcRenderer.removeListener('auth:success', listener)
  },
  onAuthError: (cb) => {
    const listener = (_e, err) => cb(err)
    ipcRenderer.on('auth:error', listener)
    return () => ipcRenderer.removeListener('auth:error', listener)
  },

  // ── Dialog ────────────────────────────────────────────────────────────────
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),

  // ── Git ───────────────────────────────────────────────────────────────────
  validateRepo:    (path)         => ipcRenderer.invoke('git:validateRepo', path),
  getLog:          (path)         => ipcRenderer.invoke('git:getLog', path),
  getCommitDetail: (data)         => ipcRenderer.invoke('git:getCommitDetail', data),
  getCommitStats:  (data)         => ipcRenderer.invoke('git:getCommitStats', data),
  getBranches:     (path)         => ipcRenderer.invoke('git:getBranches', path),
  checkout:        (data)         => ipcRenderer.invoke('git:checkout', data),
  createBranch:    (data)         => ipcRenderer.invoke('git:createBranch', data),
  merge:           (data)         => ipcRenderer.invoke('git:merge', data),
  rebase:          (data)         => ipcRenderer.invoke('git:rebase', data),
  getStatus:       (path)         => ipcRenderer.invoke('git:getStatus', path),
  getTags:         (path)         => ipcRenderer.invoke('git:getTags', path),
  getStashes:      (path)         => ipcRenderer.invoke('git:getStashes', path),
  stashSave:       (data)         => ipcRenderer.invoke('git:stashSave', data),
  stashPop:        (data)         => ipcRenderer.invoke('git:stashPop', data),
  stashDrop:       (data)         => ipcRenderer.invoke('git:stashDrop', data),
  stage:           (data)         => ipcRenderer.invoke('git:stage', data),
  unstage:         (data)         => ipcRenderer.invoke('git:unstage', data),
  discardFile:     (data)         => ipcRenderer.invoke('git:discardFile', data),
  gitCommit:       (data)         => ipcRenderer.invoke('git:commit', data),
  reset:           (data)         => ipcRenderer.invoke('git:reset', data),
  cherryPick:      (data)         => ipcRenderer.invoke('git:cherryPick', data),
  revert:          (data)         => ipcRenderer.invoke('git:revert', data),
  pull:            (path)         => ipcRenderer.invoke('git:pull', path),
  push:            (data)         => ipcRenderer.invoke('git:push', data),
  getFileDiff:     (data)         => ipcRenderer.invoke('git:getFileDiff', data),
  pullRebase:      (path)         => ipcRenderer.invoke('git:pullRebase', path),
  abortMerge:      (path)         => ipcRenderer.invoke('git:abortMerge', path),
  abortRebase:     (path)         => ipcRenderer.invoke('git:abortRebase', path),
  abortCherryPick: (path)         => ipcRenderer.invoke('git:abortCherryPick', path),

  // ── Store ─────────────────────────────────────────────────────────────────
  getRepos:   ()     => ipcRenderer.invoke('store:getRepos'),
  addRepo:    (path) => ipcRenderer.invoke('store:addRepo', path),
  removeRepo: (path) => ipcRenderer.invoke('store:removeRepo', path),

  // ── System ────────────────────────────────────────────────────────────────
  openInVSCode: (path) => ipcRenderer.invoke('system:openInVSCode', path),
  openInGitHub: (path) => ipcRenderer.invoke('system:openInGitHub', path)
})
