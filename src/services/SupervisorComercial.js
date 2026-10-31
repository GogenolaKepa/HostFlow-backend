const {setTimeout:esperarTimer}=require('node:timers/promises');
// Inerte hasta iniciar(). Polling del worker, nunca demora respuestas HTTP.
class SupervisorComercial {
  constructor({procesar,esperar=(ms,signal)=>esperarTimer(ms,undefined,{signal}),intervaloMs=1000}={}){
    if(typeof procesar!=='function'||typeof esperar!=='function'||!Number.isInteger(intervaloMs)||intervaloMs<100||intervaloMs>60000)throw TypeError('Supervisor no válido.');
    Object.assign(this,{procesar,esperar,intervaloMs});this.estado='detenido';this.ciclos=0;
  }
  iniciar(){
    if(this.tarea)return this.tarea;
    if(this.estado==='pausado')throw Error('Inspección necesaria antes de reconstruir el supervisor.');
    this.control=new AbortController();this.estado='activo';
    this.tarea=this.ejecutar().finally(()=>{this.tarea=null;});return this.tarea;
  }
  async ejecutar(){
    while(this.estado==='activo'){
      let resultado;
      try{resultado=await this.procesar();this.ciclos++;}
      catch{this.estado='pausado';break;}
      const estados=[resultado?.estado,resultado?.ingreso?.estado,resultado?.correo?.estado];
      if(estados.some(e=>['resultado-incierto','pausada-por-error','pausada-configuracion'].includes(e))){this.estado='pausado';break;}
      if(estados.includes('pausada')){this.estado='detenido';break;}
      if(this.estado!=='activo')break;
      try{await this.esperar(estados.includes('limite-alcanzado')?60000:this.intervaloMs,this.control.signal);}
      catch{if(this.estado==='activo')this.estado='pausado';break;}
    }
  }
  async detener(){if(this.estado==='activo')this.estado='detenido';this.control?.abort();await this.tarea;}
  consultar(){return Object.freeze({estado:this.estado,ciclos:this.ciclos});}
}
module.exports={SupervisorComercial};
