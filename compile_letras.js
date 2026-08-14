const fs = require('fs');
const path = require('path');

const dirPath = path.join(__dirname, 'Letras');
const outPath = path.join(__dirname, 'letras_dump.js');

const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));
const allLetras = [];

for (const file of files) {
    try {
        const filePath = path.join(dirPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);
        
        let title = data.title;
        if (!title || title.trim() === "") {
            title = file.replace('.json', '');
        }
        
        let lyrics = "";
        if (data.lyrics && data.lyrics.full_text) {
            lyrics = data.lyrics.full_text;
        } else {
            console.log(`Arquivo ${file} não tem full_text.`);
            continue;
        }

        allLetras.push({
            title: title,
            lyrics: lyrics
        });
    } catch (e) {
        console.error(`Erro ao ler ${file}: ${e}`);
    }
}

fs.writeFileSync(outPath, `window.LETRAS_DUMP = ${JSON.stringify(allLetras, null, 2)};`, 'utf-8');
console.log(`Sucesso: ${allLetras.length} letras compiladas em letras_dump.js!`);
