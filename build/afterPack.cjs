const { execFile } = require('child_process')
const { promisify } = require('util')
const { join } = require('path')

const execFileAsync = promisify(execFile)

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  await execFileAsync('xattr', ['-cr', appPath])
  await execFileAsync('codesign', ['--force', '--deep', '--sign', '-', appPath])
  await execFileAsync('codesign', ['--verify', '--deep', '--strict', appPath])
}
