const fs=require('node:fs'),path=require('node:path');
const TIPOS=Object.freeze({'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp'});
function archivoImagenPermitido(file){return typeof file?.originalname==='string'&&typeof file.mimetype==='string'&&Object.hasOwn(TIPOS,path.extname(file.originalname).toLowerCase())&&TIPOS[path.extname(file.originalname).toLowerCase()]===file.mimetype;}
function rutaImagenPublica(raw){
 let ruta;try{ruta=decodeURIComponent(raw);}catch{return null;}
 const partes=ruta.split('/');
 if(partes.length!==4||partes[0]!==''||partes[1]!=='propiedades'||! /^[1-9]\d{0,9}$/.test(partes[2])||Number(partes[2])>2147483647)return null;
 const nombre=partes[3];if(!nombre||nombre.startsWith('.')||/[\\\x00-\x1f<>:"|?*]/.test(nombre)||!Object.hasOwn(TIPOS,path.extname(nombre).toLowerCase()))return null;
 return partes.slice(1);
}
// Sólo imágenes dentro del árbol de publicaciones. No lee archivos al importar.
function crearImagenesPublicas({carpetaUploads=path.resolve(process.cwd(),'uploads')}={}){
 const raiz=path.resolve(carpetaUploads),normalizar=p=>process.platform==='win32'?p.toLowerCase():p;
 return async(req,res)=>{
  if(!['GET','HEAD'].includes(req.method))return res.sendStatus(404);
  const partes=rutaImagenPublica(req.path);if(!partes)return res.sendStatus(404);
  try{
   const [base,archivo]=await Promise.all([fs.promises.realpath(raiz),fs.promises.realpath(path.join(raiz,...partes))]);
   const directorio=path.join(base,partes[0],partes[1]);
   if(normalizar(path.dirname(archivo))!==normalizar(directorio))return res.sendStatus(404);
   res.set({'Content-Type':TIPOS[path.extname(partes[2]).toLowerCase()],'X-Content-Type-Options':'nosniff',
    'Content-Security-Policy':"default-src 'none'; sandbox; frame-ancestors 'none'",'Referrer-Policy':'no-referrer'});
   return res.sendFile(archivo,{dotfiles:'deny',acceptRanges:false},error=>{if(error&&!res.headersSent)res.sendStatus(404);});
  }catch{return res.sendStatus(404);}
 };
}
module.exports={crearImagenesPublicas,archivoImagenPermitido,rutaImagenPublica};
