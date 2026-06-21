/**
 * gitErrors.js — Clasificador central de errores de Git.
 *
 * Recibe el mensaje de error crudo de simple-git y retorna un objeto
 * estructurado con: tipo, título amigable, descripción, y acciones sugeridas.
 */

export const GIT_ERROR_TYPES = {
  CHECKOUT_DIRTY:       'CHECKOUT_DIRTY',
  PUSH_REJECTED:        'PUSH_REJECTED',
  MERGE_CONFLICT:       'MERGE_CONFLICT',
  PULL_DIRTY:           'PULL_DIRTY',
  DETACHED_HEAD:        'DETACHED_HEAD',
  FILE_LOCKED:          'FILE_LOCKED',
  NOT_A_REPO:           'NOT_A_REPO',
  AUTH_FAILED:          'AUTH_FAILED',
  REBASE_CONFLICT:      'REBASE_CONFLICT',
  CHERRY_PICK_CONFLICT: 'CHERRY_PICK_CONFLICT',
  STASH_CONFLICT:       'STASH_CONFLICT',
  GENERIC:              'GENERIC',
}

const MATCHERS = [
  {
    type: GIT_ERROR_TYPES.CHECKOUT_DIRTY,
    regex: /local changes to the following files would be overwritten by checkout|Please commit your changes or stash them before you switch/i,
    extract: (msg) => {
      const files = msg.match(/\t(.+)/g)?.map(f => f.trim()) || []
      return { files }
    },
  },
  {
    type: GIT_ERROR_TYPES.PUSH_REJECTED,
    regex: /Updates were rejected because the remote contains work|push rejected|failed to push|non-fast-forward|rejected.*fetch first/i,
    extract: () => ({}),
  },
  {
    type: GIT_ERROR_TYPES.MERGE_CONFLICT,
    regex: /Automatic merge failed|CONFLICT \(content\)|Merge conflict|fix conflicts and then commit/i,
    extract: (msg) => {
      const files = msg.match(/CONFLICT .+?in (.+)/g)?.map(f => f.replace(/CONFLICT .+?in /, '').trim()) || []
      return { files }
    },
  },
  {
    type: GIT_ERROR_TYPES.REBASE_CONFLICT,
    regex: /CONFLICT .+?Merge conflict in|could not apply|rebase.*conflict/i,
    extract: (msg) => {
      const files = msg.match(/CONFLICT .+?in (.+)/g)?.map(f => f.replace(/CONFLICT .+?in /, '').trim()) || []
      return { files }
    },
  },
  {
    type: GIT_ERROR_TYPES.STASH_CONFLICT,
    regex: /Cannot apply stash.*conflict|stash.*Aborting|could not restore stash/i,
    extract: () => ({}),
  },
  {
    type: GIT_ERROR_TYPES.CHERRY_PICK_CONFLICT,
    regex: /cherry.pick.*conflict|after resolving the conflicts.*cherry-pick/i,
    extract: () => ({}),
  },
  {
    type: GIT_ERROR_TYPES.PULL_DIRTY,
    regex: /local changes to the following files would be overwritten by merge|Please commit your changes or stash them before you merge/i,
    extract: (msg) => {
      const files = msg.match(/\t(.+)/g)?.map(f => f.trim()) || []
      return { files }
    },
  },
  {
    type: GIT_ERROR_TYPES.DETACHED_HEAD,
    regex: /You are in 'detached HEAD'|not currently on a branch|HEAD detached/i,
    extract: () => ({}),
  },
  {
    type: GIT_ERROR_TYPES.FILE_LOCKED,
    regex: /unable to unlink|Permission denied|Device or resource busy|cannot open|file exists and is not/i,
    extract: (msg) => {
      const fileMatch = msg.match(/unable to unlink old '(.+?)'|'(.+?)': Permission denied|cannot open '(.+?)'/)
      const file = fileMatch?.[1] || fileMatch?.[2] || fileMatch?.[3] || ''
      return { file }
    },
  },
  {
    type: GIT_ERROR_TYPES.NOT_A_REPO,
    regex: /not a git repository|does not appear to be a git repository/i,
    extract: () => ({}),
  },
  {
    type: GIT_ERROR_TYPES.AUTH_FAILED,
    regex: /authentication failed|could not read username|terminal prompts disabled|permission denied \(publickey\)/i,
    extract: () => ({}),
  },
]

/**
 * Clasifica un mensaje de error de Git.
 * @param {string} rawError  — El mensaje de error crudo.
 * @param {string} [operation] — La operación que falló (ej. 'checkout', 'push').
 * @returns {GitError}
 */
export function classifyGitError(rawError, operation = '') {
  const msg = String(rawError || '')

  for (const matcher of MATCHERS) {
    if (matcher.regex.test(msg)) {
      return {
        type: matcher.type,
        operation,
        rawMessage: msg,
        data: matcher.extract(msg),
        ...getErrorMeta(matcher.type, operation),
      }
    }
  }

  return {
    type: GIT_ERROR_TYPES.GENERIC,
    operation,
    rawMessage: msg,
    data: {},
    ...getErrorMeta(GIT_ERROR_TYPES.GENERIC, operation),
  }
}

function getErrorMeta(type, operation) {
  const meta = {
    [GIT_ERROR_TYPES.CHECKOUT_DIRTY]: {
      title: 'Cambios locales serían sobrescritos',
      description: 'Tienes archivos modificados que colisionan con la rama de destino.',
      severity: 'warning',
      actions: ['stash_checkout', 'discard_checkout', 'cancel'],
    },
    [GIT_ERROR_TYPES.PUSH_REJECTED]: {
      title: 'Push rechazado por el remoto',
      description: 'La rama remota tiene commits que no tenés localmente.',
      severity: 'warning',
      actions: ['pull_ff', 'pull_rebase', 'force_push', 'cancel'],
    },
    [GIT_ERROR_TYPES.MERGE_CONFLICT]: {
      title: 'Conflictos de merge detectados',
      description: 'Git no pudo fusionar automáticamente. Debes resolver los conflictos manualmente.',
      severity: 'conflict',
      actions: ['open_conflicts', 'abort_merge', 'cancel'],
    },
    [GIT_ERROR_TYPES.REBASE_CONFLICT]: {
      title: 'Conflictos durante el rebase',
      description: 'El rebase encontró conflictos. Resuélvelos y luego continuá.',
      severity: 'conflict',
      actions: ['open_conflicts', 'abort_rebase', 'cancel'],
    },
    [GIT_ERROR_TYPES.STASH_CONFLICT]: {
      title: 'Conflicto al restaurar el stash',
      description: 'Los cambios guardados en el stash no se pudieron aplicar sin conflictos.',
      severity: 'conflict',
      actions: ['open_conflicts', 'cancel'],
    },
    [GIT_ERROR_TYPES.CHERRY_PICK_CONFLICT]: {
      title: 'Conflicto en cherry-pick',
      description: 'El cherry-pick generó conflictos. Resuélvelos y continuá.',
      severity: 'conflict',
      actions: ['open_conflicts', 'abort_cherry_pick', 'cancel'],
    },
    [GIT_ERROR_TYPES.PULL_DIRTY]: {
      title: 'Pull sobrescribiría cambios locales',
      description: 'Tenés archivos modificados que serían sobrescritos por el pull.',
      severity: 'warning',
      actions: ['autostash_pull', 'focus_commit', 'cancel'],
    },
    [GIT_ERROR_TYPES.DETACHED_HEAD]: {
      title: 'Estás en modo Detached HEAD',
      description: 'Los commits que hagas aquí no pertenecen a ninguna rama y podrían perderse.',
      severity: 'info',
      actions: ['create_branch', 'cancel'],
    },
    [GIT_ERROR_TYPES.FILE_LOCKED]: {
      title: 'Archivo bloqueado por el sistema',
      description: 'Un archivo está siendo usado por otro proceso. Cerrá el programa que lo tiene abierto.',
      severity: 'error',
      actions: ['retry', 'cancel'],
    },
    [GIT_ERROR_TYPES.NOT_A_REPO]: {
      title: 'No es un repositorio Git',
      description: 'La carpeta seleccionada no contiene un repositorio Git válido.',
      severity: 'error',
      actions: ['cancel'],
    },
    [GIT_ERROR_TYPES.AUTH_FAILED]: {
      title: 'Fallo de autenticación',
      description: 'Git no pudo autenticarse con el servidor remoto. Verificá tus credenciales o clave SSH.',
      severity: 'error',
      actions: ['cancel'],
    },
    [GIT_ERROR_TYPES.GENERIC]: {
      title: `Error en operación Git${operation ? ` (${operation})` : ''}`,
      description: 'Ocurrió un error inesperado.',
      severity: 'error',
      actions: ['cancel'],
    },
  }

  return meta[type] || meta[GIT_ERROR_TYPES.GENERIC]
}
