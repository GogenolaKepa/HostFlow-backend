-- PROPUESTA A REVISAR Y PROBAR CON MOTOR. No ejecutar al arrancar ni en npm test.
-- No modifica precios, importes, Usuarios ni ninguna tabla existente. Sin backfill.
-- Version v2, NO APLICADA. Si existe una version anterior, detener: este script no la actualiza.
SET XACT_ABORT ON;
DECLARE @Aplicar bit=0,@InventarioRevisado bit=0,@ServidorEsperado sysname=NULL;
IF ISNULL(@Aplicar,0)<>1 OR ISNULL(@InventarioRevisado,0)<>1 OR @ServidorEsperado IS NULL THROW 52310,'DDL bloqueado.',1;
IF @@TRANCOUNT<>0 OR (@@OPTIONS & 2)=2 OR USER_NAME()=N'hostflow_app' THROW 52311,'Se requiere sesion administrativa dedicada sin transaccion implicita.',1;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'HostFlow' OR DATALENGTH(DB_NAME())<>DATALENGTH(N'HostFlow')
 OR ISNULL(CONVERT(int,SERVERPROPERTY('EngineEdition')),0)<>5
 OR ISNULL(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')),N'') COLLATE Latin1_General_100_BIN2<>@ServidorEsperado COLLATE Latin1_General_100_BIN2
 OR ISNULL(DATALENGTH(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName'))),0)<>DATALENGTH(@ServidorEsperado)
 THROW 52312,'Destino no acreditado.',1;
IF ISNULL(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION'),0)<>1 OR ISNULL(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CREATE TABLE'),0)<>1
 OR ISNULL(HAS_PERMS_BY_NAME(N'dbo','SCHEMA','ALTER'),0)<>1 THROW 52313,'Capacidades administrativas insuficientes.',1;
IF OBJECT_ID(N'dbo.ConfiguracionMonetaria') IS NOT NULL OR OBJECT_ID(N'dbo.TarifasPropiedad') IS NOT NULL OR OBJECT_ID(N'dbo.AcuerdosMonetariosReserva') IS NOT NULL
 THROW 52314,'Existen objetos del modelo. No repetir.',1;
-- Verificar claves int NOT NULL simples y unicas; detener ante esquema distinto.
IF EXISTS(SELECT 1 FROM (VALUES(N'Usuarios',N'IdUsuario'),(N'Empresas',N'IdEmpresa'),(N'Propiedades',N'IdPropiedad'),(N'Reservas',N'IdReserva')) v(tabla,columna)
 WHERE NOT EXISTS(SELECT 1 FROM sys.columns c WHERE c.object_id=OBJECT_ID(N'dbo.'+v.tabla,N'U') AND c.name=v.columna AND c.system_type_id=56 AND c.is_nullable=0)
 OR NOT EXISTS(SELECT 1 FROM sys.indexes i JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id
 JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
 WHERE i.object_id=OBJECT_ID(N'dbo.'+v.tabla,N'U') AND i.is_unique=1 AND i.is_disabled=0 AND i.has_filter=0 AND ic.key_ordinal=1 AND c.name=v.columna
 AND NOT EXISTS(SELECT 1 FROM sys.index_columns x WHERE x.object_id=i.object_id AND x.index_id=i.index_id AND x.key_ordinal>1))
 OR ISNULL(HAS_PERMS_BY_NAME(N'dbo.'+v.tabla,N'OBJECT',N'REFERENCES'),0)<>1)
 THROW 52315,'Claves existentes o REFERENCES incompatibles.',1;
BEGIN TRY
 BEGIN TRANSACTION;
 CREATE TABLE dbo.ConfiguracionMonetaria(
  IdEmpresa int NOT NULL CONSTRAINT PK_ConfiguracionMonetaria PRIMARY KEY,
  Fuente varchar(10) COLLATE Latin1_General_100_BIN2 NOT NULL,
  Tipo varchar(40) COLLATE Latin1_General_100_BIN2 NOT NULL,
  Valor decimal(18,8) NOT NULL,FechaCotizacion date NOT NULL,HoraPublicacion time(0) NULL,
  ConsultadaEn datetime2(0) NULL,FechaActualizacion datetime2(0) NOT NULL CONSTRAINT DF_Monedas_Fecha DEFAULT SYSUTCDATETIME(),
  IdUsuarioActualizacion int NOT NULL,VersionRegistro rowversion NOT NULL,
  CONSTRAINT FK_Monedas_Empresa FOREIGN KEY(IdEmpresa) REFERENCES dbo.Empresas(IdEmpresa),
  CONSTRAINT FK_Monedas_Autor FOREIGN KEY(IdUsuarioActualizacion) REFERENCES dbo.Usuarios(IdUsuario),
  CONSTRAINT CK_Monedas_Valor CHECK(Valor>0),
  CONSTRAINT CK_Monedas_Fuente CHECK((Fuente='MANUAL' AND DATALENGTH(Fuente)=6 AND Tipo='MANUAL' AND DATALENGTH(Tipo)=6)
    OR(Fuente='BCRA' AND DATALENGTH(Fuente)=4 AND Tipo='BCRA_TIPO_COTIZACION' AND DATALENGTH(Tipo)=20))
 );
 CREATE TABLE dbo.TarifasPropiedad(
  IdPropiedad int NOT NULL CONSTRAINT PK_TarifasPropiedad PRIMARY KEY,IdEmpresa int NOT NULL,
  Moneda char(3) COLLATE Latin1_General_100_BIN2 NOT NULL,PrecioBase decimal(18,2) NOT NULL,
  ReferenciaFuente varchar(10) COLLATE Latin1_General_100_BIN2 NULL,ReferenciaTipo varchar(40) COLLATE Latin1_General_100_BIN2 NULL,
  ReferenciaValor decimal(18,8) NULL,ReferenciaFecha date NULL,
  IdUsuarioActualizacion int NOT NULL,FechaActualizacion datetime2(0) NOT NULL CONSTRAINT DF_Tarifas_Fecha DEFAULT SYSUTCDATETIME(),VersionRegistro rowversion NOT NULL,
  CONSTRAINT FK_Tarifas_Propiedad FOREIGN KEY(IdPropiedad) REFERENCES dbo.Propiedades(IdPropiedad),
  CONSTRAINT FK_Tarifas_Empresa FOREIGN KEY(IdEmpresa) REFERENCES dbo.Empresas(IdEmpresa),
  CONSTRAINT FK_Tarifas_Autor FOREIGN KEY(IdUsuarioActualizacion) REFERENCES dbo.Usuarios(IdUsuario),
  CONSTRAINT CK_Tarifas_Moneda CHECK(Moneda IN('ARS','USD')),CONSTRAINT CK_Tarifas_Precio CHECK(PrecioBase>0),
  CONSTRAINT CK_Tarifas_Referencia CHECK((ReferenciaFuente IS NULL AND ReferenciaTipo IS NULL AND ReferenciaValor IS NULL AND ReferenciaFecha IS NULL)
   OR(ReferenciaFuente IS NOT NULL AND ReferenciaTipo IS NOT NULL AND ReferenciaValor IS NOT NULL AND ReferenciaValor>0 AND ReferenciaFecha IS NOT NULL AND
    ((ReferenciaFuente='MANUAL' AND DATALENGTH(ReferenciaFuente)=6 AND ReferenciaTipo='MANUAL' AND DATALENGTH(ReferenciaTipo)=6)
     OR(ReferenciaFuente='BCRA' AND DATALENGTH(ReferenciaFuente)=4 AND ReferenciaTipo='BCRA_TIPO_COTIZACION' AND DATALENGTH(ReferenciaTipo)=20))))
 );
 CREATE TABLE dbo.AcuerdosMonetariosReserva(
  IdReserva int NOT NULL CONSTRAINT PK_AcuerdosMonetariosReserva PRIMARY KEY,IdEmpresa int NOT NULL,
  Moneda char(3) COLLATE Latin1_General_100_BIN2 NOT NULL,Importe decimal(18,2) NOT NULL,PagoEquivalenteARS bit NOT NULL,
  FuenteReferencia varchar(10) COLLATE Latin1_General_100_BIN2 NULL,TipoReferencia varchar(40) COLLATE Latin1_General_100_BIN2 NULL,
  FuenteAplicada varchar(10) NULL,TipoAplicado varchar(40) NULL,ValorAplicado decimal(18,8) NULL,FechaEfectiva date NULL,
  FechaCheckinFijada date NULL,FijadoEn datetime2(0) NULL,EquivalenteARS decimal(18,2) NULL,IdUsuarioFijacion int NULL,
  IdUsuarioAcuerdo int NOT NULL,FechaAcuerdo datetime2(0) NOT NULL CONSTRAINT DF_Acuerdos_Fecha DEFAULT SYSUTCDATETIME(),
  IdUsuarioActualizacion int NOT NULL,FechaActualizacion datetime2(0) NOT NULL CONSTRAINT DF_Acuerdos_Actualizacion DEFAULT SYSUTCDATETIME(),VersionRegistro rowversion NOT NULL,
  CONSTRAINT FK_Acuerdos_Reserva FOREIGN KEY(IdReserva) REFERENCES dbo.Reservas(IdReserva),
  CONSTRAINT FK_Acuerdos_Empresa FOREIGN KEY(IdEmpresa) REFERENCES dbo.Empresas(IdEmpresa),
  CONSTRAINT FK_Acuerdos_Autor FOREIGN KEY(IdUsuarioAcuerdo) REFERENCES dbo.Usuarios(IdUsuario),
  CONSTRAINT FK_Acuerdos_Fijador FOREIGN KEY(IdUsuarioFijacion) REFERENCES dbo.Usuarios(IdUsuario),
  CONSTRAINT FK_Acuerdos_Actualizador FOREIGN KEY(IdUsuarioActualizacion) REFERENCES dbo.Usuarios(IdUsuario),
  CONSTRAINT CK_Acuerdos_Moneda CHECK(Moneda IN('ARS','USD')),CONSTRAINT CK_Acuerdos_Importe CHECK(Importe>=0),
  CONSTRAINT CK_Acuerdos_Equivalencia CHECK(PagoEquivalenteARS=0 OR Moneda='USD'),
  CONSTRAINT CK_Acuerdos_Referencia CHECK((PagoEquivalenteARS=0 AND FuenteReferencia IS NULL AND TipoReferencia IS NULL)
   OR(PagoEquivalenteARS=1 AND FuenteReferencia IS NOT NULL AND TipoReferencia IS NOT NULL AND
    ((FuenteReferencia='MANUAL' AND DATALENGTH(FuenteReferencia)=6 AND TipoReferencia='MANUAL' AND DATALENGTH(TipoReferencia)=6)
     OR(FuenteReferencia='BCRA' AND DATALENGTH(FuenteReferencia)=4 AND TipoReferencia='BCRA_TIPO_COTIZACION' AND DATALENGTH(TipoReferencia)=20)))),
  CONSTRAINT CK_Acuerdos_Fijacion CHECK((FuenteAplicada IS NULL AND TipoAplicado IS NULL AND ValorAplicado IS NULL AND FechaEfectiva IS NULL AND FechaCheckinFijada IS NULL AND FijadoEn IS NULL AND EquivalenteARS IS NULL AND IdUsuarioFijacion IS NULL)
   OR(PagoEquivalenteARS=1 AND FuenteAplicada IS NOT NULL AND TipoAplicado IS NOT NULL AND ValorAplicado IS NOT NULL AND ValorAplicado>0 AND FechaEfectiva IS NOT NULL AND FechaCheckinFijada IS NOT NULL AND FechaEfectiva<=FechaCheckinFijada AND FijadoEn IS NOT NULL AND EquivalenteARS IS NOT NULL AND EquivalenteARS>=0 AND IdUsuarioFijacion IS NOT NULL
    AND FuenteAplicada COLLATE Latin1_General_100_BIN2=FuenteReferencia AND TipoAplicado COLLATE Latin1_General_100_BIN2=TipoReferencia
    AND EquivalenteARS=CONVERT(decimal(18,2),ROUND(Importe*ValorAplicado,2))
    AND ((FuenteAplicada COLLATE Latin1_General_100_BIN2='MANUAL' AND DATALENGTH(FuenteAplicada)=6 AND TipoAplicado COLLATE Latin1_General_100_BIN2='MANUAL' AND DATALENGTH(TipoAplicado)=6)
     OR(FuenteAplicada COLLATE Latin1_General_100_BIN2='BCRA' AND DATALENGTH(FuenteAplicada)=4 AND TipoAplicado COLLATE Latin1_General_100_BIN2='BCRA_TIPO_COTIZACION' AND DATALENGTH(TipoAplicado)=20))))
 );
 CREATE INDEX IX_Tarifas_Empresa ON dbo.TarifasPropiedad(IdEmpresa,IdPropiedad);
 CREATE INDEX IX_Acuerdos_Empresa ON dbo.AcuerdosMonetariosReserva(IdEmpresa,Moneda);
 EXEC sys.sp_addextendedproperty @name=N'HostFlowMonedasModelo',@value=N'hostflow-monedas-v2',@level0type=N'SCHEMA',@level0name=N'dbo',@level1type=N'TABLE',@level1name=N'ConfiguracionMonetaria';
 EXEC sys.sp_addextendedproperty @name=N'HostFlowMonedasModelo',@value=N'hostflow-monedas-v2',@level0type=N'SCHEMA',@level0name=N'dbo',@level1type=N'TABLE',@level1name=N'TarifasPropiedad';
 EXEC sys.sp_addextendedproperty @name=N'HostFlowMonedasModelo',@value=N'hostflow-monedas-v2',@level0type=N'SCHEMA',@level0name=N'dbo',@level1type=N'TABLE',@level1name=N'AcuerdosMonetariosReserva';
 COMMIT TRANSACTION;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
 THROW;
END CATCH;
