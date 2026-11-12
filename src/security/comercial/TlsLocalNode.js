// Certificado de sesión LOOPBACK. Primitivas Node/OpenSSL, sin ejecutables,
// instalación de CA o archivos con clave privada. No es un certificado público.
const crypto=require('node:crypto');
function der(tag,...partes){const b=Buffer.concat(partes);let n=b.length;const bytes=[];while(n){bytes.unshift(n&255);n>>>=8;}return Buffer.concat([Buffer.from([tag]),b.length<128?Buffer.from([b.length]):Buffer.from([128|bytes.length,...bytes]),b]);}
const seq=(...p)=>der(0x30,...p),oid=hex=>der(6,Buffer.from(hex,'hex'));
function entero(b){if(b[0]&128)b=Buffer.concat([Buffer.from([0]),b]);return der(2,b);}
function tiempo(d){return der(0x17,Buffer.from(d.toISOString().replace(/[-:T]/g,'').slice(2,14)+'Z'));}
function crearTlsLocal(){
 const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:3072});
 const algoritmo=seq(oid('2a864886f70d01010b'),der(5,Buffer.alloc(0)));
 const nombre=seq(der(0x31,seq(oid('550403'),der(0x0c,Buffer.from('HostFlow Loopback Session')))));
 const serial=crypto.randomBytes(16);serial[0]&=127;serial[0]|=1;
 const extension=(id,valor,critica=false)=>seq(oid(id),...(critica?[der(1,Buffer.from([255]))]:[]),der(4,valor));
 const extensiones=der(0xa3,seq(
  extension('551d13',seq(),true),
  extension('551d0f',der(3,Buffer.from([5,0xa0])),true),
  extension('551d25',seq(oid('2b06010505070301'))),
  extension('551d11',seq(der(0x82,Buffer.from('localhost')),der(0x87,Buffer.from([127,0,0,1]))))));
 const tbs=seq(der(0xa0,entero(Buffer.from([2]))),entero(serial),algoritmo,nombre,
  seq(tiempo(new Date(Date.now()-60000)),tiempo(new Date(Date.now()+24*3600000))),nombre,publicKey.export({type:'spki',format:'der'}),extensiones);
 const cert=seq(tbs,algoritmo,der(3,Buffer.from([0]),crypto.sign('RSA-SHA256',tbs,privateKey)));
 const x509=new crypto.X509Certificate(cert);
 if(!x509.verify(publicKey)||!x509.checkHost('localhost')||!x509.checkIP('127.0.0.1'))throw Error('TLS local no acreditado.');
 const pem=Buffer.from(x509.toString()),key=Buffer.from(privateKey.export({type:'pkcs8',format:'pem'}));
 return{opciones:{key,cert:pem,minVersion:'TLSv1.2'},certificado:pem,sha256:crypto.createHash('sha256').update(cert).digest('hex'),liberar(){key.fill(0);}};
}
module.exports={crearTlsLocal};
