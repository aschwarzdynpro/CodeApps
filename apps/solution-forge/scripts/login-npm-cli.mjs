// Sign the Schulz account into the npm power-apps CLI's own MSAL cache via
// DEVICE CODE. The CLI itself only offers a browser login without account
// selection, which SSO-picks the wrong (home) account on this machine, and it
// aborts as soon as the cache holds more than one account — see CLAUDE.md
// ("npm-CLI-Konto"). Same client id + cache file as the CLI, authority pinned
// to the Schulz tenant. Usage:  npx power-apps logout && node scripts/login-npm-cli.mjs
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

const appDir = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..')
// Optional: mirror the device-code message into this file too.
const codeFile = process.argv[2]
const req = createRequire(path.join(appDir, 'package.json'))
const { PublicClientApplication } = await import(pathToFileURL(req.resolve('@azure/msal-node')).href)
const { DataProtectionScope, PersistenceCachePlugin, PersistenceCreator } =
  await import(pathToFileURL(req.resolve('@azure/msal-node-extensions')).href)

const cacheDir = path.join(os.homedir(), '.powerapps-cli', 'cache', 'auth')
fs.mkdirSync(cacheDir, { recursive: true })
const persistence = await PersistenceCreator.createPersistence({
  cachePath: path.join(cacheDir, 'msal_cache.json'),
  dataProtectionScope: DataProtectionScope.CurrentUser,
  serviceName: 'power-apps',
  accountName: 'power-apps',
  usePlaintextFileOnLinux: false,
})
const pca = new PublicClientApplication({
  auth: {
    authority: 'https://login.microsoftonline.com/24686796-cf09-4d11-ac19-9ab3819f3491',
    clientId: '9cee029c-6210-4654-90bb-17e6e9d36617',
  },
  cache: { cachePlugin: new PersistenceCachePlugin(persistence) },
})
const result = await pca.acquireTokenByDeviceCode({
  scopes: ['https://service.powerapps.com/.default'],
  deviceCodeCallback: (r) => {
    if (codeFile) fs.writeFileSync(codeFile, r.message + '\n')
    console.log(r.message)
  },
})
console.log('LOGIN OK:', result.account?.username, 'tenant', result.tenantId)
console.log('accounts now:', (await pca.getTokenCache().getAllAccounts()).map((a) => a.username))
