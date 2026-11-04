// Auxiliar Windows .NET Framework: DPAPI CurrentUser, sin PowerShell ni SQL.
// El contrato CLIXML es deliberadamente limitado a PSCredential de los cuatro perfiles.
using System;
using System.Collections.Generic;
using System.IO;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Xml;
using System.Web.Script.Serialization;
using System.Runtime.InteropServices;

namespace HostFlow.Authcom {
 public static class CredencialDpapi {
  const string Ns="http://schemas.microsoft.com/powershell/2004/04";
  public static readonly IDictionary<string,string> Perfiles=new Dictionary<string,string>(StringComparer.Ordinal) {
   {"ingresoHttp","hostflow_auth_ingreso"},{"workerIngreso","hostflow_auth_worker"},{"cuentas","hostflow_auth_cuentas"},{"correo","hostflow_auth_correo"}
  };
  public static void ComprobarAncestros(string ruta) {
   string actual=Path.GetFullPath(ruta);
   while(actual!=null) {
    if((File.Exists(actual)||Directory.Exists(actual))&&(File.GetAttributes(actual)&FileAttributes.ReparsePoint)!=0)throw new InvalidOperationException();
    DirectoryInfo padre=Directory.GetParent(actual);actual=padre==null?null:padre.FullName;
   }
  }
  public static void ComprobarPrivado(string ruta,bool carpeta) {
   ComprobarAncestros(ruta);
   FileSystemSecurity acl=carpeta?(FileSystemSecurity)Directory.GetAccessControl(ruta):File.GetAccessControl(ruta);
   SecurityIdentifier sid=WindowsIdentity.GetCurrent().User;
   if(!sid.Equals(acl.GetOwner(typeof(SecurityIdentifier))))throw new InvalidOperationException();
   bool permisoPropio=false;
   foreach(FileSystemAccessRule regla in acl.GetAccessRules(true,true,typeof(SecurityIdentifier))) {
    if(regla.AccessControlType!=AccessControlType.Allow)continue;
    string sujeto=regla.IdentityReference.Value;
    if(sujeto!=sid.Value&&sujeto!="S-1-5-18")throw new InvalidOperationException();
    if(sujeto==sid.Value&&(regla.FileSystemRights&FileSystemRights.ReadData)!=0)permisoPropio=true;
   }
   if(!permisoPropio)throw new InvalidOperationException();
  }
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
  static extern bool CreateDirectory(string ruta,IntPtr seguridad);
  static void CrearCarpetaPrivada(string ruta){
   ComprobarAncestros(ruta);
   if(!CreateDirectory(ruta,IntPtr.Zero))throw new InvalidOperationException();
   DirectorySecurity acl=Directory.GetAccessControl(ruta);SecurityIdentifier sid=WindowsIdentity.GetCurrent().User;
   if(!sid.Equals(acl.GetOwner(typeof(SecurityIdentifier))))throw new InvalidOperationException();
   // Cambiar solo DACL de la carpeta NUEVA; no solicitar WRITE_OWNER innecesario.
   acl.SetAccessRuleProtection(true,false);
   foreach(FileSystemAccessRule regla in acl.GetAccessRules(true,true,typeof(SecurityIdentifier)))acl.RemoveAccessRuleSpecific(regla);
   foreach(string sujeto in new string[]{sid.Value,"S-1-5-18"})acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(sujeto),FileSystemRights.FullControl,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));
   Directory.SetAccessControl(ruta,acl);ComprobarPrivado(ruta,true);
  }
  public static void VerificarAlmacen(string carpeta){
   ComprobarPrivado(carpeta,true);
   if(Directory.GetFileSystemEntries(carpeta).Length!=4)throw new InvalidOperationException();
   HashSet<string> vistos=new HashSet<string>(StringComparer.Ordinal);
   try{foreach(string perfil in Perfiles.Keys){Dictionary<string,object> v=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(Leer(carpeta,perfil));string p=(string)v["password"];if(p.Length!=64||!vistos.Add(p))throw new InvalidOperationException();}}finally{vistos.Clear();}
  }
  public static void Provisionar(string carpeta){
   // Solo crea un almacen nuevo y lo conserva ante fallos; nunca borra/regenera.
   if(Directory.Exists(carpeta)||File.Exists(carpeta))throw new InvalidOperationException();
   string padre=Directory.GetParent(carpeta).FullName;
   ComprobarAncestros(padre);
   if(!Directory.Exists(padre))CrearCarpetaPrivada(padre);else ComprobarPrivado(padre,true);
   CrearCarpetaPrivada(carpeta);
   HashSet<string> vistos=new HashSet<string>(StringComparer.Ordinal);
   using(RandomNumberGenerator rng=RandomNumberGenerator.Create())try{
    foreach(string perfil in Perfiles.Keys){
     byte[] azar=new byte[48],claro=null,cifrado=null;
     try{
      string privada;do{rng.GetBytes(azar);privada=Convert.ToBase64String(azar);}while(!vistos.Add(privada));
      claro=Encoding.Unicode.GetBytes(privada);cifrado=ProtectedData.Protect(claro,null,DataProtectionScope.CurrentUser);
      string archivo=Path.Combine(carpeta,perfil+".credential.xml");
      using(FileStream f=new FileStream(archivo,FileMode.CreateNew,FileAccess.Write,FileShare.None)){
       XmlWriterSettings opciones=new XmlWriterSettings();opciones.Encoding=new UTF8Encoding(false);
       using(XmlWriter x=XmlWriter.Create(f,opciones)){
        x.WriteStartElement("Objs",Ns);x.WriteAttributeString("Version","1.1.0.1");x.WriteStartElement("Obj",Ns);x.WriteAttributeString("RefId","0");
        x.WriteStartElement("TN",Ns);x.WriteAttributeString("RefId","0");x.WriteElementString("T",Ns,"System.Management.Automation.PSCredential");x.WriteElementString("T",Ns,"System.Object");x.WriteEndElement();
        x.WriteStartElement("Props",Ns);x.WriteStartElement("S",Ns);x.WriteAttributeString("N","UserName");x.WriteString(Perfiles[perfil]);x.WriteEndElement();
        x.WriteStartElement("SS",Ns);x.WriteAttributeString("N","Password");x.WriteString(BitConverter.ToString(cifrado).Replace("-","").ToLowerInvariant());x.WriteEndElement();
        x.WriteEndElement();x.WriteEndElement();x.WriteEndElement();
       }
      }
      ComprobarPrivado(archivo,false);
     }finally{Array.Clear(azar,0,azar.Length);if(claro!=null)Array.Clear(claro,0,claro.Length);if(cifrado!=null)Array.Clear(cifrado,0,cifrado.Length);}
    }
   }finally{vistos.Clear();}
   VerificarAlmacen(carpeta);
  }
  public static string Leer(string carpeta,string perfil) {
   if(!Perfiles.ContainsKey(perfil))throw new InvalidOperationException();
   string archivo=Path.Combine(carpeta,perfil+".credential.xml");
   ComprobarPrivado(carpeta,true);ComprobarPrivado(archivo,false);
   byte[] protegido=null,claro=null;
   try {
    using(FileStream flujo=new FileStream(archivo,FileMode.Open,FileAccess.Read,FileShare.Read)) {
     if(flujo.Length<1||flujo.Length>16384)throw new InvalidOperationException();
     XmlReaderSettings opciones=new XmlReaderSettings();opciones.DtdProcessing=DtdProcessing.Prohibit;opciones.XmlResolver=null;opciones.MaxCharactersInDocument=16384;
     XmlDocument xml=new XmlDocument();xml.XmlResolver=null;
     using(XmlReader lector=XmlReader.Create(flujo,opciones))xml.Load(lector);
     XmlNamespaceManager n=new XmlNamespaceManager(xml.NameTable);n.AddNamespace("p",Ns);
     if(xml.SelectNodes("/p:Objs/p:Obj",n).Count!=1||xml.SelectNodes("/p:Objs/*",n).Count!=1)throw new InvalidOperationException();
     XmlNode tipo=xml.SelectSingleNode("/p:Objs/p:Obj/p:TN/p:T[1]",n);
     XmlNodeList propiedades=xml.SelectNodes("/p:Objs/p:Obj/p:Props",n);
     if(tipo==null||tipo.InnerText!="System.Management.Automation.PSCredential"||propiedades.Count!=1||propiedades[0].ChildNodes.Count!=2)throw new InvalidOperationException();
     XmlNodeList usuarios=xml.SelectNodes("/p:Objs/p:Obj/p:Props/p:S[@N='UserName']",n);
     XmlNodeList passwords=xml.SelectNodes("/p:Objs/p:Obj/p:Props/p:SS[@N='Password']",n);
     if(usuarios.Count!=1||passwords.Count!=1||usuarios[0].InnerText!=Perfiles[perfil])throw new InvalidOperationException();
     string hex=passwords[0].InnerText;
     if(hex.Length<40||hex.Length>8192||hex.Length%2!=0)throw new InvalidOperationException();
     protegido=new byte[hex.Length/2];
     for(int i=0;i<protegido.Length;i++)protegido[i]=Convert.ToByte(hex.Substring(i*2,2),16);
     claro=ProtectedData.Unprotect(protegido,null,DataProtectionScope.CurrentUser);
     if(claro.Length<64||claro.Length>256||claro.Length%2!=0)throw new InvalidOperationException();
     string privada=new UnicodeEncoding(false,false,true).GetString(claro);
     foreach(char c in privada)if(Char.IsControl(c))throw new InvalidOperationException();
     return new JavaScriptSerializer().Serialize(new Dictionary<string,string>{{"user",Perfiles[perfil]},{"password",privada}});
    }
   }finally {if(protegido!=null)Array.Clear(protegido,0,protegido.Length);if(claro!=null)Array.Clear(claro,0,claro.Length);}
  }
 }
 public static class ProgramaDpapi {
  public static int Main(string[] args) {
   try {
    if(Environment.OSVersion.Platform!=PlatformID.Win32NT||!Console.IsOutputRedirected)throw new InvalidOperationException();
    Console.OutputEncoding=new UTF8Encoding(false);
    if(args.Length==1&&args[0]=="--identity") {
     WindowsIdentity id=WindowsIdentity.GetCurrent();
     Console.Write(new JavaScriptSerializer().Serialize(new {cuenta=id.Name,sid=id.User.Value,windows=true}));return 0;
    }
    string local=Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
    if(!String.Equals(Path.GetFullPath(local),Path.GetFullPath(Environment.GetEnvironmentVariable("LOCALAPPDATA")??""),StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException();
    string carpeta=Path.Combine(local,"HostFlow","AuthcomCredencialesV1");
    if(args.Length==1&&args[0]=="--verify"){CredencialDpapi.VerificarAlmacen(carpeta);Console.Write("{\"perfiles\":4,\"aclPrivada\":true,\"dpapi\":true}");return 0;}
    if(args.Length==4&&args[0]=="--provision"&&args[1]=="--account"&&args[3]=="--authorize"&&String.Equals(args[2],WindowsIdentity.GetCurrent().Name,StringComparison.OrdinalIgnoreCase)){
     CredencialDpapi.Provisionar(carpeta);Console.Write("{\"perfiles\":4,\"aclPrivada\":true,\"dpapi\":true,\"azure\":false}");return 0;
    }
    if(args.Length!=2||args[0]!="--read"||!CredencialDpapi.Perfiles.ContainsKey(args[1]))throw new InvalidOperationException();
    Console.Write(CredencialDpapi.Leer(carpeta,args[1]));return 0;
   }catch {Console.Error.WriteLine("Credencial comercial no disponible. Sin detalles privados.");return 1;}
  }
 }
}
