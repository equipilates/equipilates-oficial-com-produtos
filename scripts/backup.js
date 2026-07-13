import { createClient } from '@supabase/supabase-js';
import fs from 'fs-extra';
import path from 'path';
import archiver from 'archiver';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

// Configuração do Supabase
const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || 'https://aigegzzlmpxtfewxixif.supabase.co';
const SUPABASE_ANON_KEY = process.env.PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpZ2VnenpsbXB4dGZld3hpeGlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NjE5MTksImV4cCI6MjA5OTUzNzkxOX0.I64rIVU9cOzSry8AV_NIyJcdQs6dWBx7q3IJTO-rllU';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Parse argumentos da linha de comando
const args = process.argv.slice(2);
const backupDatabase = args.includes('--database') || args.includes('-d') || args.includes('--all') || args.length === 0;
const backupStorage = args.includes('--storage') || args.includes('-s') || args.includes('--all') || args.length === 0;
const backupCode = args.includes('--code') || args.includes('-c') || args.includes('--all') || args.length === 0;

// Função para gerar nome do arquivo
function getBackupFileName() {
  const now = new Date();
  const dateStr = now.toISOString()
    .replace(/T/, '-')
    .replace(/\..+/, '')
    .replace(/:/g, '');
  
  const components = [];
  if (backupDatabase) components.push('db');
  if (backupStorage) components.push('storage');
  if (backupCode) components.push('code');
  
  const suffix = components.length === 3 ? 'all' : components.join('-');
  return `backup-${dateStr}-${suffix}.zip`;
}

// Função para exportar banco de dados
async function exportDatabase() {
  console.log('📦 Exportando banco de dados...');
  
  const tables = ['categories', 'products', 'site_settings', 'product_images'];
  const data = {};
  
  for (const table of tables) {
    const { data: tableData, error } = await supabase
      .from(table)
      .select('*');
    
    if (error) {
      console.error(`❌ Erro ao exportar ${table}:`, error.message);
      data[table] = [];
    } else {
      data[table] = tableData || [];
      console.log(`  ✓ ${table}: ${data[table].length} registros`);
    }
  }
  
  return data;
}

// Função para baixar imagens do Storage
async function downloadStorageImages() {
  console.log('🖼️  Baixando imagens do Storage...');
  
  const { data: files, error } = await supabase
    .storage
    .from('product-images')
    .list('', {
      limit: 1000,
      offset: 0,
      sortBy: { column: 'name', order: 'asc' }
    });
  
  if (error) {
    console.error('❌ Erro ao listar imagens:', error.message);
    return {};
  }
  
  const images = {};
  let downloaded = 0;
  
  for (const file of files || []) {
    if (file.name && !file.name.endsWith('/')) {
      const { data: fileData, error: downloadError } = await supabase
        .storage
        .from('product-images')
        .download(file.name);
      
      if (downloadError) {
        console.error(`  ❌ Erro ao baixar ${file.name}:`, downloadError.message);
      } else {
        const buffer = await fileData.arrayBuffer();
        images[file.name] = Buffer.from(buffer);
        downloaded++;
        console.log(`  ✓ Baixado: ${file.name}`);
      }
    }
  }
  
  console.log(`  ✓ Total: ${downloaded} imagens baixadas`);
  return images;
}

// Função para copiar arquivos do código
async function copyCodeFiles() {
  console.log('📄 Copiando arquivos do código...');
  
  const codeFiles = {
    'package.json': path.join(projectRoot, 'package.json'),
    '.env.example': path.join(projectRoot, '.env.example'),
    'README.md': path.join(projectRoot, 'README.md'),
    'vercel.json': path.join(projectRoot, 'vercel.json')
  };
  
  const files = {};
  
  for (const [name, filePath] of Object.entries(codeFiles)) {
    if (await fs.pathExists(filePath)) {
      const content = await fs.readFile(filePath, 'utf-8');
      files[name] = content;
      console.log(`  ✓ ${name}`);
    } else {
      console.log(`  ⚠ ${name} não encontrado`);
    }
  }
  
  return files;
}

// Função para criar ZIP
async function createZip(databaseData, storageImages, codeFiles) {
  console.log('🗜️  Criando arquivo ZIP...');
  
  const backupsDir = path.join(projectRoot, 'backups');
  await fs.ensureDir(backupsDir);
  
  const fileName = getBackupFileName();
  const zipPath = path.join(backupsDir, fileName);
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });
  
  return new Promise((resolve, reject) => {
    output.on('close', () => {
      console.log(`✅ Backup criado: ${fileName}`);
      console.log(`   📁 Local: ${zipPath}`);
      console.log(`   📊 Tamanho: ${(archive.pointer() / 1024 / 1024).toFixed(2)} MB`);
      resolve(zipPath);
    });
    
    archive.on('error', (err) => {
      reject(err);
    });
    
    archive.pipe(output);
    
    // Adicionar dados do banco
    if (backupDatabase && databaseData) {
      for (const [table, data] of Object.entries(databaseData)) {
        archive.append(JSON.stringify(data, null, 2), { name: `database/${table}.json` });
      }
    }
    
    // Adicionar imagens
    if (backupStorage && storageImages) {
      for (const [fileName, buffer] of Object.entries(storageImages)) {
        archive.append(buffer, { name: `storage/product-images/${fileName}` });
      }
    }
    
    // Adicionar arquivos de código
    if (backupCode && codeFiles) {
      for (const [fileName, content] of Object.entries(codeFiles)) {
        archive.append(content, { name: `code/${fileName}` });
      }
    }
    
    // Adicionar metadata
    const metadata = {
      timestamp: new Date().toISOString(),
      components: {
        database: backupDatabase,
        storage: backupStorage,
        code: backupCode
      },
      version: '1.0.0'
    };
    archive.append(JSON.stringify(metadata, null, 2), { name: 'metadata.json' });
    
    // Adicionar README
    const readme = `Backup gerado em ${new Date().toLocaleString('pt-BR')}

Componentes incluídos:
${backupDatabase ? '- Banco de Dados (database/)\n' : ''}${backupStorage ? '- Imagens do Storage (storage/)\n' : ''}${backupCode ? '- Código do Projeto (code/)\n' : ''}

Para restaurar:
1. Descompacte este arquivo ZIP
2. Restaure os arquivos JSON do diretório database/ no Supabase
3. Faça upload das imagens do diretório storage/ para o bucket product-images
4. Copie os arquivos de code/ para o projeto
`;
    archive.append(readme, { name: 'README.txt' });
    
    archive.finalize();
  });
}

// Função principal
async function main() {
  console.log('🚀 Iniciando backup...\n');
  
  let databaseData = null;
  let storageImages = null;
  let codeFiles = null;
  
  try {
    if (backupDatabase) {
      databaseData = await exportDatabase();
    }
    
    if (backupStorage) {
      storageImages = await downloadStorageImages();
    }
    
    if (backupCode) {
      codeFiles = await copyCodeFiles();
    }
    
    const zipPath = await createZip(databaseData, storageImages, codeFiles);
    console.log('\n✨ Backup concluído com sucesso!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Erro ao criar backup:', error);
    process.exit(1);
  }
}

// Executar
main();
