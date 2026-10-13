// Build with the GitHub Pages base path and force-push dist/ to the gh-pages branch.
// Pages is configured to serve that branch ("Deploy from a branch"), so no Actions minutes are needed.
import { execSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'

const run = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', ...opts })
const out = (cmd) => execSync(cmd).toString().trim()

const remote = out('git remote get-url origin')
const sha = out('git rev-parse --short HEAD')
const name = out('git config user.name')
const email = out('git config user.email')

rmSync('dist', { recursive: true, force: true })
run('pnpm build', { env: { ...process.env, GITHUB_PAGES: 'true' } })
writeFileSync('dist/.nojekyll', '')

const git = (args) => run(`git ${args}`, { cwd: 'dist' })
git('init -q -b gh-pages')
git('add -A')
git(`-c user.name="${name}" -c user.email="${email}" commit -q -m "Deploy ${sha}"`)
git(`push -q -f ${remote} gh-pages`)
rmSync('dist/.git', { recursive: true, force: true })
console.log(`\nDeployed ${sha} → https://qiuyedx.github.io/motion-3d-lab/ (GitHub Pages rebuilds in ~1 min)`)
