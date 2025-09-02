#!/usr/bin/env node

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

const PACKAGE_PATH = 'packages/surreal-better-auth';

function run(command, options = {}) {
  try {
    return execSync(command, { encoding: 'utf8', ...options }).trim();
  } catch (error) {
    return null;
  }
}

function checkGitStatus() {
  const status = run('git status --porcelain');
  const uncommitted = run('git diff --exit-code') === null;
  const unstaged = run('git diff --cached --exit-code') === null;
  
  return {
    clean: !status && !uncommitted && !unstaged,
    status: status || 'Clean'
  };
}

function getCurrentVersion() {
  const pkg = JSON.parse(readFileSync(join(PACKAGE_PATH, 'package.json'), 'utf8'));
  return pkg.version;
}

function checkNpmStatus() {
  try {
    const published = run(`npm view surreal-better-auth version`);
    return published;
  } catch {
    return 'Not published';
  }
}

function main() {
  console.log('🔍 Release Status Check\n');

  // Git status
  const git = checkGitStatus();
  console.log(`📁 Git Status: ${git.clean ? '✅ Clean' : '❌ Uncommitted changes'}`);
  if (!git.clean) {
    console.log(`   ${git.status}`);
  }

  // Current version
  const currentVersion = getCurrentVersion();
  console.log(`📦 Current Version: ${currentVersion}`);

  // NPM status
  const npmVersion = checkNpmStatus();
  console.log(`🌐 NPM Version: ${npmVersion}`);
  
  if (currentVersion === npmVersion) {
    console.log('⚠️  Current version already published to NPM');
  }

  // Branch check
  const branch = run('git branch --show-current');
  console.log(`🌿 Current Branch: ${branch}`);
  
  if (branch !== 'main' && branch !== 'master') {
    console.log('⚠️  Not on main/master branch');
  }

  // Recent tags
  const tags = run('git tag -l --sort=-version:refname | head -3');
  if (tags) {
    console.log(`🏷️  Recent Tags:`);
    tags.split('\n').forEach(tag => console.log(`   ${tag}`));
  }

  console.log('\n' + '='.repeat(50));
  console.log('ℹ️  New branch-based release flow');
  
  if (git.clean) {
    if (branch === 'beta') {
      console.log('🔄 Ready for beta release!');
      console.log('\nNext: git push origin beta');
      console.log('→ GitHub Actions will auto-increment beta version and publish');
    } else if (branch === 'main' || branch === 'master') {
      console.log('🚀 Ready for stable release!');
      console.log('\nNext: Create PR from beta → main');
      console.log('→ GitHub Actions will promote beta to stable and publish');
    } else {
      console.log('ℹ️  Switch to beta (for prerelease) or main (for stable)');
      console.log('   git checkout beta    # for beta releases');
      console.log('   git checkout main    # for stable releases');
    }
  } else {
    console.log('⚠️  Not ready for release. Fix issues above first.');
    if (!git.clean) console.log('   - Commit or stash your changes');
  }
}

main();