import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Comprobación del contenedor y las dimensiones, sin sustituir una
// decodificación de píxeles. Especificación: developers.google.com/speed/webp/docs/riff_container
export function inspectWebP(bytes) {
  const require = (condition,message) => { if(!condition)throw Error(message); };
  require(Buffer.isBuffer(bytes)&&bytes.length>0,'Archivo vacío');
  require(bytes.length>=20,'Cabecera WebP truncada');
  require(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP','Firma RIFF/WebP incorrecta');
  require(bytes.readUInt32LE(4)+8===bytes.length,'Tamaño RIFF distinto del archivo');
  const chunks=[];
  for(let offset=12;offset<bytes.length;){
    require(offset+8<=bytes.length,'Cabecera de bloque truncada');
    const type=bytes.toString('ascii',offset,offset+4),size=bytes.readUInt32LE(offset+4);
    const start=offset+8,end=start+size,next=end+(size%2);
    require(next<=bytes.length,`Bloque ${type} truncado`);
    require(!(size%2)||bytes[end]===0,`Relleno de bloque ${type} incorrecto`);
    chunks.push({type,data:bytes.subarray(start,end)});
    offset=next;
  }
  const images=chunks.filter(chunk=>chunk.type==='VP8 '||chunk.type==='VP8L');
  require(images.length===1,'La página debe contener una sola imagen estática');
  require(!chunks.some(chunk=>chunk.type==='ANIM'||chunk.type==='ANMF'),'Una página documental no admite animación');
  const extended=chunks.filter(chunk=>chunk.type==='VP8X');
  require(extended.length<=1,'Cabecera VP8X duplicada');
  if(!extended.length)require(chunks[0]===images[0],'Falta cabecera VP8X antes de los bloques de imagen');
  else require(chunks[0]===extended[0],'VP8X debe ser el primer bloque');
  const image=images[0],data=image.data;
  let width,height;
  if(image.type==='VP8 '){
    require(data.length>10,'Datos VP8 truncados');
    require((data[0]&1)===0&&data.subarray(3,6).equals(Buffer.from([0x9d,0x01,0x2a])),'Cabecera de imagen VP8 incorrecta');
    width=data.readUInt16LE(6)&0x3fff;height=data.readUInt16LE(8)&0x3fff;
    require(width>0&&height>0,'Dimensiones VP8 nulas');
  }else{
    require(data.length>5&&data[0]===0x2f,'Cabecera de imagen VP8L incorrecta o truncada');
    const dimensions=data.readUInt32LE(1);
    require((dimensions>>>29)===0,'Versión VP8L no admitida');
    width=(dimensions&0x3fff)+1;height=((dimensions>>>14)&0x3fff)+1;
  }
  if(extended.length){
    const header=extended[0].data;
    require(header.length===10,'Tamaño de cabecera VP8X incorrecto');
    require((header[0]&0xc3)===0&&header.subarray(1,4).every(value=>value===0),'Banderas VP8X reservadas o de animación');
    const canvasWidth=header.readUIntLE(4,3)+1,canvasHeight=header.readUIntLE(7,3)+1;
    require(width===canvasWidth&&height===canvasHeight,'Dimensiones VP8X distintas de la imagen');
  }
  return {width,height,format:image.type.trim(),bytes:bytes.length};
}

export async function auditSourcePages(root,{sources,cards}={}) {
  root=path.resolve(root);
  sources??=JSON.parse(await fs.readFile(path.join(root,'data/sources.json'),'utf8'));
  cards??=JSON.parse(await fs.readFile(path.join(root,'data/cards.json'),'utf8'));
  const failures=[],sourceById=new Map(sources.map(source=>[source.id,source]));
  let pages=0,validPages=0,links=0;
  const published=sources.filter(source=>source.pageImageBase);
  for(const source of published){
    const base=path.resolve(root,source.pageImageBase),relative=path.relative(root,base);
    if(!Number.isSafeInteger(source.pageCount)||source.pageCount<1||path.isAbsolute(source.pageImageBase)||relative.startsWith('..'+path.sep)||relative==='..'||!relative){
      failures.push({sourceId:source.id,code:'invalid_metadata',message:'Ruta o cantidad de páginas incorrecta'});continue;
    }
    const entries=await fs.readdir(base,{withFileTypes:true}).catch(error=>{if(error.code==='ENOENT')return [];throw error;});
    for(const entry of entries.filter(entry=>entry.name.endsWith('.webp'))){
      const match=/^([1-9]\d*)\.webp$/.exec(entry.name),page=match?Number(match[1]):0;
      if(!match||!Number.isSafeInteger(page)||page>source.pageCount)failures.push({sourceId:source.id,path:path.posix.join(source.pageImageBase,entry.name),code:'unexpected_page',message:'Archivo de página fuera de la numeración declarada'});
    }
    for(let page=1;page<=source.pageCount;page++){
      pages++;
      const relativePath=path.posix.join(source.pageImageBase,`${page}.webp`),filename=path.join(base,`${page}.webp`);
      try{
        const info=await fs.lstat(filename);
        if(!info.isFile())throw Error('La página no es un archivo regular');
        const bytes=await fs.readFile(filename);
        inspectWebP(bytes);validPages++;
      }catch(error){
        failures.push({sourceId:source.id,page,path:relativePath,code:error.code==='ENOENT'?'missing':'invalid_webp',message:error.code==='ENOENT'?'No existe el archivo de página':error.message});
      }
    }
  }
  for(const card of cards){
    const source=sourceById.get(card.sourceId);
    for(const page of card.pages||[]){
      links++;
      if(!source?.pageImageBase||!Number.isSafeInteger(page)||page<1||page>source.pageCount)failures.push({sourceId:card.sourceId,cardId:card.id,page,code:'invalid_card_page',message:'La ficha apunta a una página no disponible en su fuente'});
    }
  }
  return {ok:failures.length===0,sources:published.length,pages,validPages,cardPageLinks:links,failures};
}

export function assertSourcePages(report) {
  if(!report.ok)throw Error(`Páginas documentales inválidas (${report.failures.length}):\n`+report.failures.map(failure=>`${failure.path||failure.cardId||failure.sourceId}: ${failure.message}`).join('\n'));
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const report=await auditSourcePages(path.resolve(import.meta.dirname,'..'));
  console.log(JSON.stringify(report));
  if(!report.ok)process.exitCode=1;
}
