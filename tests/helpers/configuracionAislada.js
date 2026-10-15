const { ErrorSeguridad } = require('../../src/security/seguridadUsuarios');
const { CAMPOS_EMPRESA, ZONA_OPERATIVA } = require('../../src/security/validacionConfiguracion');

class ConfiguracionAislada {
  constructor(usuarios) { this.usuarios=usuarios;this.reset(); }
  reset() {
    this.lecturas=0;this.escrituras=0;this.numero=2;
    this.empresas=new Map([1,2].map(id=>[id,{...Object.fromEntries(Object.keys(CAMPOS_EMPRESA).map(c=>[c,''])),nombreComercial:`Empresa aislada ${id}`,versionRegistro:'0000000000000001'}]));
    this.operativas=new Map([1,2].map(id=>[id,{horaIngreso:'15:00',horaEgreso:'10:00',zonaHoraria:ZONA_OPERATIVA,versionRegistro:'0000000000000002'}]));
  }
  async comprobarModelo(){this.lecturas++;}
  async leer(id,tipo){this.lecturas++;const row=(tipo==='empresa'?this.empresas:this.operativas).get(id);if(!row)throw new ErrorSeguridad(503,'EMPRESA_NO_CONFIGURADA','Empresa no vinculada.');return {...row};}
  async actualizar(id,tipo,datos,revision,actor) {
    const map=tipo==='empresa'?this.empresas:this.operativas;
    const actual=map.get(id);
    if(!actual||actual.versionRegistro!==revision)throw new ErrorSeguridad(409,'CONFIGURACION_CONFLICTO','La configuración cambió. Recargá los datos.');
    const nuevo={...actual,...datos,versionRegistro:(++this.numero).toString(16).padStart(16,'0')};
    map.set(id,nuevo);this.ultimoActor=actor;this.escrituras++;return {...nuevo};
  }
  async transaccion(operacion) {
    return this.usuarios.transaccionSeguridad(async()=>{
      const original={empresas:new Map(this.empresas),operativas:new Map(this.operativas),escrituras:this.escrituras};
      try{return await operacion(this);}catch(e){Object.assign(this,original);throw e;}
    });
  }
}
module.exports=ConfiguracionAislada;
