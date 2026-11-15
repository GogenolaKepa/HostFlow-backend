const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),dns=require('node:dns'),net=require('node:net'),{spawnSync}=require('node:child_process');
const CF=String.raw`C:\Users\Kepa\AppData\Local\Programs\HostFlow\cloudflared\2026.10.7\cloudflared.exe`;
const SHA='2493dbc168923bb3e59e5e7716f71deced92992eea9acd6e9d74f84ac7751343';
const UUID='03a9247c-8e33-45f3-8964-518d9333bca3';
const CRED=String.raw`C:\Users\Kepa\.cloudflared\03a9247c-8e33-45f3-8964-518d9333bca3.json`;
const RUTA='^/api/(auth/(login|me|logout)|cuentas-comerciales/(capacidades|recuperacion/(solicitar|validar|confirmar)))$';
function comprobarEntorno(nombres=Object.keys(process.env)){
 if(nombres.some(k=>/^(TUNNEL_|NO_TLS_VERIFY$|NO_AUTOUPDATE$|NODE_(OPTIONS|EXTRA_CA_CERTS|TLS_REJECT_UNAUTHORIZED|USE_ENV_PROXY)$|HTTPS?_PROXY$|ALL_PROXY$|JWT_SECRET$|RESEND_API_KEY$|HOSTFLOW_AUTH_COMERCIAL_(CIFRADO_BASE64|INDICE_BASE64)$)/i.test(k)))throw Error('Overrides no permitidos.');
}
function entornoAuxiliar(){return{SystemRoot:'C:\\Windows',WINDIR:'C:\\Windows',USERPROFILE:'C:\\Users\\Kepa',LOCALAPPDATA:'C:\\Users\\Kepa\\AppData\\Local'};}
function servidoresWindows(ejecutar=spawnSync){
 const comando="$ErrorActionPreference='Stop';$s=@(Get-NetIPConfiguration | Where-Object { $_.NetAdapter.Status -eq 'Up' -and $_.IPv4DefaultGateway } | ForEach-Object { $_.DNSServer.ServerAddresses } | Where-Object { $_ -match '^([0-9]{1,3}\\.){3}[0-9]{1,3}$' } | Sort-Object -Unique);ConvertTo-Json -InputObject $s -Compress";
 const r=ejecutar('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',comando],{shell:false,windowsHide:true,env:entornoAuxiliar(),timeout:10000,encoding:'utf8',maxBuffer:8192});
 if(r.status!==0)throw Error('DNS Windows no acreditado.');let s;try{s=JSON.parse(r.stdout.replace(/^\uFEFF/,''));}catch{throw Error('DNS Windows no acreditado.');}return validarServidores(s);
}
function validarServidores(s){if(!Array.isArray(s)||!s.length||s.length>10||s.some(ip=>net.isIP(ip)!==4||/^(0|127|22[4-9]|23\d|24\d|25\d)\./.test(ip)))throw Error('DNS no acreditados.');return[...new Set(s)];}
async function comprobarDNS(s,{resolver=ip=>{const r=new dns.promises.Resolver({timeout:2500,tries:1});r.setServers([ip]);return r;}}={}){
 s=validarServidores(s);for(const ip of s)for(const n of ['region1.v2.argotunnel.com','region2.v2.argotunnel.com']){const r=await resolver(ip).resolve4(n);if(!Array.isArray(r)||!r.length||r.some(v=>net.isIP(v)!==4))throw Error('DNS no acreditado.');}return s;
}
function yaml(certificado){if(!path.win32.isAbsolute(certificado)||/[\r\n]/.test(certificado))throw Error('Certificado no acreditado.');const q=p=>JSON.stringify(p.replaceAll('\\','/'));return`tunnel: ${UUID}\ncredentials-file: ${q(CRED)}\nno-autoupdate: true\nmetrics: 127.0.0.1:20241\ningress:\n  - hostname: api.hostflow.com.ar\n    path: '${RUTA}'\n    service: https://localhost:4000\n    originRequest:\n      httpHostHeader: api.hostflow.com.ar\n      originServerName: localhost\n      caPool: ${q(certificado)}\n      noTLSVerify: false\n  - service: http_status:404\n`;}
function argumentos(archivo,s){return['tunnel','--config',archivo,'run',...validarServidores(s).flatMap(ip=>['--dns-resolver-addrs',ip+':53']),UUID];}
function comprobarBinarioYReferencia(archivos){if(crypto.createHash('sha256').update(fs.readFileSync(CF)).digest('hex')!==SHA)throw Error('Versión Tunnel no acreditada.');archivos.ruta(CRED);archivos.verificar(CRED);const s=fs.lstatSync(CRED);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1)throw Error('Referencia de credencial no acreditada.');}
function validarOffline(archivo,ejecutar=spawnSync){const r=ejecutar(CF,['tunnel','--config',archivo,'ingress','validate'],{shell:false,windowsHide:true,env:entornoAuxiliar(),encoding:'utf8',timeout:10000,maxBuffer:16384});if(r.status!==0)throw Error('Ingress no acreditado.');}
module.exports={CF,SHA,UUID,CRED,RUTA,comprobarEntorno,entornoAuxiliar,servidoresWindows,validarServidores,comprobarDNS,yaml,argumentos,comprobarBinarioYReferencia,validarOffline};
