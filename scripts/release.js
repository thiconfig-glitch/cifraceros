const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const write = (file, content) => fs.writeFileSync(path.join(root, file), content);

function run(command, args, options = {}) {
  execFileSync(command, args, { cwd: root, stdio: 'inherit', ...options });
}

function bumpVersion(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Versão inválida: ${version}`);
  const parts = version.split('.').map(Number);
  parts[2] += 1;
  return parts.join('.');
}

function main() {
  const packageJson = JSON.parse(read('package.json'));
  const lockJson = JSON.parse(read('package-lock.json'));
  const nextVersion = process.argv[2] || bumpVersion(packageJson.version);
  if (!/^\d+\.\d+\.\d+$/.test(nextVersion)) throw new Error('Use uma versão no formato MAJOR.MINOR.PATCH.');
  if (nextVersion === packageJson.version) throw new Error('A versão informada já é a versão atual.');

  const apkVersion = read('android/app/build.gradle').match(/versionName\s+"([^"]+)"/);
  if (!apkVersion || apkVersion[1] !== packageJson.version || lockJson.version !== packageJson.version || lockJson.packages?.['']?.version !== packageJson.version) {
    throw new Error('As versões de package.json, package-lock.json e Android estão divergentes; alinhe-as antes de publicar.');
  }

  const versionedFiles = ['index.html', 'sw.js'].map((file) => [file, read(file)]);
  for (const [file, contents] of versionedFiles) {
    if (!contents.includes(packageJson.version)) throw new Error(`${file} não contém a versão atual ${packageJson.version}.`);
  }

  packageJson.version = nextVersion;
  lockJson.version = nextVersion;
  lockJson.packages[''].version = nextVersion;
  write('package.json', `${JSON.stringify(packageJson, null, 2)}\n`);
  write('package-lock.json', `${JSON.stringify(lockJson, null, 2)}\n`);

  const gradle = read('android/app/build.gradle')
    .replace(/versionCode\s+(\d+)/, (_, code) => `versionCode ${Number(code) + 1}`)
    .replace(`versionName "${apkVersion[1]}"`, `versionName "${nextVersion}"`);
  write('android/app/build.gradle', gradle);

  for (const [file, contents] of versionedFiles) write(file, contents.replaceAll(apkVersion[1], nextVersion));

  run('cmd.exe', ['/c', 'npm.cmd', 'run', 'cap:sync']);
  run('cmd.exe', ['/c', 'gradlew.bat', 'clean', 'assembleDebug'], { cwd: path.join(root, 'android') });

  const apk = path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
  if (!fs.existsSync(apk)) throw new Error('Build terminou sem gerar o APK esperado.');
  fs.copyFileSync(apk, path.join(root, 'cifraceros.apk'));
  fs.copyFileSync(apk, path.join(root, `cifraceros-v${nextVersion}.apk`));

  console.log(`\nVersão ${nextVersion} pronta. APK atualizado: cifraceros.apk e cifraceros-v${nextVersion}.apk`);
  console.log('Revise e publique com: git add package.json package-lock.json android/app/build.gradle index.html sw.js cifraceros.apk cifraceros-v*.apk; git commit -m "release: v' + nextVersion + '"; git push');
}

try {
  main();
} catch (error) {
  console.error(`\nFalha ao preparar publicação: ${error.message}`);
  process.exitCode = 1;
}
