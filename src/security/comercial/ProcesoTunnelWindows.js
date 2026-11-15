// Herramientas Windows firmadas para metadatos y una ventana INTERACTIVA propia.
// No compila auxiliares, descifra secretos, emite señales emuladas ni mata procesos.
const {spawnSync,spawn}=require('node:child_process');
const {entornoAuxiliar,CF}=require('./TunnelRecuperacionWindows');
const PS='C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
function ejecutar(script,datos={},crear=spawnSync){
 const input=JSON.stringify(datos).replace(/[^\x00-\x7f]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'))+'\n';
 const r=crear(PS,['-NoLogo','-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop';$e=[Console]::In.ReadLine()|ConvertFrom-Json;"+script],{shell:false,windowsHide:true,env:entornoAuxiliar(),input,encoding:'utf8',timeout:10000,maxBuffer:8192});
 if(r.status!==0)throw Error('Metadatos de procesos no acreditados.');try{return JSON.parse(r.stdout.replace(/^\uFEFF/,''));}catch{throw Error('Metadatos de procesos no acreditados.');}
}
function comprobarSinServicios(crear){
 const d=ejecutar("$ports=@([Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()|Where-Object {$_.Port -eq 4000 -or $_.Port -eq 20241});$cf=@(Get-Process -Name cloudflared -ErrorAction SilentlyContinue);$n=@(Get-CimInstance Win32_Process -Filter \"Name='node.exe'\"|Where-Object {$_.ProcessId -ne $e.pid -and $_.CommandLine -match 'iniciarComercial|hostflowHabitualWindows|[\\\\/]HostFlow[\\\\/]backend'});@{libre=($ports.Count -eq 0 -and $cf.Count -eq 0 -and $n.Count -eq 0)}|ConvertTo-Json -Compress",{pid:process.pid},crear);
 if(d.libre!==true)throw Error('Otro host/Tunnel o puerto ocupado.');
}
async function abrirVentana(args,{crear=spawn,onIncierto=()=>{}}={}){
 if(!Array.isArray(args)||args.some(a=>typeof a!=='string'||/[\s"'`$;&|<>]/.test(a)))throw Error('Argumentos del Tunnel no acreditados.');
 const script="$ErrorActionPreference='Stop';try{$e=[Console]::In.ReadLine()|ConvertFrom-Json;$p=Start-Process -FilePath $e.exe -ArgumentList $e.args -WindowStyle Normal -PassThru;[Console]::Out.WriteLine((@{evento='iniciado';pid=$p.Id;inicio=$p.StartTime.ToUniversalTime().Ticks.ToString()}|ConvertTo-Json -Compress));[Console]::Out.Flush();$p.WaitForExit();[Console]::Out.WriteLine((@{evento='cerrado';pid=$p.Id}|ConvertTo-Json -Compress));exit 0}catch{[Console]::Error.Write('PROCESO_TUNNEL_INCIERTO');exit 1}";
 const auxiliar=crear(PS,['-NoLogo','-NoProfile','-NonInteractive','-Command',script],{shell:false,windowsHide:true,env:entornoAuxiliar(),stdio:['pipe','pipe','pipe']});
 let identidad,fin=false,buffer='',resolverInicio,rechazarInicio,resolverCierre;const iniciado=new Promise((r,j)=>{resolverInicio=r;rechazarInicio=j;}),cerrado=new Promise(r=>{resolverCierre=r;});
 const incierto=()=>{const e=Error('Proceso Tunnel no acreditado.');e.codigo='CIERRE_NO_ACREDITADO';rechazarInicio(e);onIncierto('TUNNEL_OBSERVADOR_INCIERTO');};
 auxiliar.stdout.on('data',b=>{buffer+=b.toString('utf8');if(buffer.length>8192){incierto();return;}let n;while((n=buffer.indexOf('\n'))!==-1){const linea=buffer.slice(0,n);buffer=buffer.slice(n+1);let d;try{d=JSON.parse(linea);}catch{incierto();continue;}
  if(d.evento==='iniciado'&&!identidad&&Number.isSafeInteger(d.pid)&&d.pid>0&&/^\d{16,20}$/.test(d.inicio||'')){identidad={pid:d.pid,inicio:d.inicio};resolverInicio({...identidad,cerrado,terminado:()=>fin});}
  else if(d.evento==='cerrado'&&identidad&&d.pid===identidad.pid){fin=true;resolverCierre();}else incierto();
 }});
 auxiliar.stderr.on('data',()=>incierto());auxiliar.once('error',incierto);
 for(const s of [auxiliar.stdin,auxiliar.stdout,auxiliar.stderr])s.on('error',incierto);
 auxiliar.once('close',()=>{if(fin)return;incierto();if(identidad){const observar=()=>{try{if(!consultarProceso(identidad)){fin=true;resolverCierre();return;}}catch{}setTimeout(observar,3000);};observar();}});
 const input=JSON.stringify({exe:CF,args}).replace(/[^\x00-\x7f]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));auxiliar.stdin.end(input+'\n');
 return iniciado;
}
function consultarProceso(id,crear){
 if(!Number.isSafeInteger(id.pid)||id.pid<1||!/^\d{16,20}$/.test(id.inicio||''))throw Error('Identidad de proceso no válida.');
 const d=ejecutar('$p=Get-Process -Id $e.pid -ErrorAction SilentlyContinue;if($null -eq $p){@{activo=$false}|ConvertTo-Json -Compress}else{@{activo=$true;inicio=$p.StartTime.ToUniversalTime().Ticks.ToString()}|ConvertTo-Json -Compress}',{pid:id.pid},crear);
 if(typeof d.activo!=='boolean'||d.activo&&typeof d.inicio!=='string')throw Error('Estado de proceso desconocido.');return d.activo&&d.inicio===id.inicio;
}
function pidActivo(pid,crear){if(!Number.isSafeInteger(pid)||pid<1)throw Error('PID inválido.');const d=ejecutar('@{existe=($null -ne (Get-Process -Id $e.pid -ErrorAction SilentlyContinue))}|ConvertTo-Json -Compress',{pid},crear);if(typeof d.existe!=='boolean')throw Error('Estado del PID incierto.');return d.existe;}
module.exports={ejecutar,comprobarSinServicios,abrirVentana,consultarProceso,pidActivo};
