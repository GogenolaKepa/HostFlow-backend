// Herramientas Windows originales solo para identidad/ACL. Nunca reciben secretos,
// descifran DPAPI, compilan código o ejecutan auxiliares bloqueados.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const sistema={SystemRoot:'C:\\Windows',WINDIR:'C:\\Windows'};
const script=`$ErrorActionPreference='Stop';try{
$e=[Console]::In.ReadLine()|ConvertFrom-Json
$id=[Security.Principal.WindowsIdentity]::GetCurrent()
if($e.accion -eq 'identidad'){[Console]::Out.Write((@{cuenta=$id.Name;sid=$id.User.Value}|ConvertTo-Json -Compress));exit}
$p=Get-Item -LiteralPath $e.ruta -Force
if(($p.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Ruta'}
if($e.accion -eq 'proteger'){
 if($p.PSIsContainer){$a=New-Object Security.AccessControl.DirectorySecurity;$herencia=[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'}else{$a=New-Object Security.AccessControl.FileSecurity;$herencia=[Security.AccessControl.InheritanceFlags]::None}
 $a.SetOwner($id.User);$a.SetAccessRuleProtection($true,$false)
 foreach($sid in @($id.User,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'))){$a.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl',$herencia,'None','Allow'))}
 Set-Acl -LiteralPath $e.ruta -AclObject $a
}
$a=Get-Acl -LiteralPath $e.ruta
$owner=$a.GetOwner([Security.Principal.SecurityIdentifier]).Value
$ajenos=@($a.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])|Where-Object {$_.AccessControlType -eq 'Allow' -and $_.IdentityReference.Value -ne $id.User.Value -and $_.IdentityReference.Value -ne 'S-1-5-18'})
if($owner -ne $id.User.Value -or -not $a.AreAccessRulesProtected -or $ajenos.Count -ne 0){throw 'ACL'}
[Console]::Out.Write((@{cuenta=$id.Name;sid=$id.User.Value;privado=$true}|ConvertTo-Json -Compress))
}catch{[Console]::Error.Write('ACL_NO_ACREDITADA');exit 1}`;
const fallo=()=>Error('Ruta o permisos privados no acreditados.');
function ruta(p){
 if(typeof p!=='string'||!path.win32.isAbsolute(p)||!/[A-Za-z]:[\\/]/.test(p.slice(0,3))||/[:\x00-\x1f]/.test(p.slice(2)))throw fallo();
 const r=path.resolve(p);if(r.length>900||r.length<4)throw fallo();
 for(let a=r;path.dirname(a)!==a;a=path.dirname(a)){try{if(fs.lstatSync(a).isSymbolicLink())throw fallo();}catch(e){if(e.code!=='ENOENT')throw e;}}
 return r;
}
function consultar(accion,p){
 if(process.platform!=='win32')throw fallo();if(p)ruta(p);
 const r=spawnSync('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',script],{shell:false,windowsHide:true,env:sistema,input:JSON.stringify({accion,ruta:p})+'\n',encoding:'utf8',timeout:10000,maxBuffer:8192});
 if(r.status!==0)throw fallo();let d;try{d=JSON.parse(r.stdout.replace(/^\uFEFF/,''));}catch{throw fallo();}
 if(typeof d.cuenta!=='string'||!/^S-1-5-21-\d+-\d+-\d+-\d+$/.test(d.sid||'')||accion!=='identidad'&&d.privado!==true)throw fallo();return d;
}
function identidad(cuenta){const d=consultar('identidad');if(cuenta&&d.cuenta.toLowerCase()!==cuenta.toLowerCase())throw fallo();return d;}
function verificar(p){ruta(p);return consultar('verificar',p);}
function crearDirectorio(p){p=ruta(p);if(fs.existsSync(p))throw fallo();fs.mkdirSync(p);consultar('proteger',p);return verificar(p);}
function leer(p){p=ruta(p);verificar(path.dirname(p));verificar(p);const fd=fs.openSync(p,'r');try{const s=fs.fstatSync(fd);if(!s.isFile()||s.nlink!==1||s.size<1||s.size>65536)throw fallo();return fs.readFileSync(fd);}finally{fs.closeSync(fd);}}
function escribirNuevo(p,bytes){
 p=ruta(p);verificar(path.dirname(p));if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>65536||fs.existsSync(p))throw fallo();
 const tmp=path.join(path.dirname(p),'.pendiente-'+require('node:crypto').randomUUID());let fd;
 try{fd=fs.openSync(tmp,'wx',0o600);consultar('proteger',tmp);fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;fs.linkSync(tmp,p);fs.unlinkSync(tmp);verificar(p);}
 finally{if(fd!==undefined)fs.closeSync(fd);/* Un parcial se conserva; no borrar o reparar automáticamente. */}
}
module.exports={ruta,identidad,verificar,crearDirectorio,leer,escribirNuevo};
