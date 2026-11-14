const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const wwwDir = path.resolve(rootDir, 'www');

if (!fs.existsSync(wwwDir)) {
    fs.mkdirSync(wwwDir, { recursive: true });
}

// Arquivos e pastas permitidos na pasta www
const webFiles = [
    'index.html',
    'style.css',
    'script.js',
    'error_tracker.js',
    'manifest.json',
    'sw.js'
];

console.log('🔄 Sincronizando arquivos web para a pasta www...');

webFiles.forEach(file => {
    const src = path.join(rootDir, file);
    const dest = path.join(wwwDir, file);
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        console.log(` ✅ Copiado: ${file}`);
    } else {
        console.warn(` ⚠️ Arquivo não encontrado: ${file}`);
    }
});

console.log('✨ Pasta www sincronizada com sucesso!');
