/* SOLO PARA UNA BASE LOCAL DE PRUEBAS PREVIAMENTE AUTORIZADA Y VACIA.
   NO crea bases; NO usar en HostFlow ni Azure. NO EJECUTADO.
   Necesita autorizacion separada para escribir la marca de aislamiento. */
DECLARE @EscrituraAutorizada bit = 0;
IF @EscrituraAutorizada <> 1
  THROW 51200, 'Falta autorizacion de escritura local aislada.', 1;
IF DB_NAME() NOT LIKE N'HostFlow[_]Test[_]%' OR DB_NAME() = N'HostFlow'
  THROW 51201, 'Destino de pruebas incorrecto.', 1;
IF CONVERT(int,SERVERPROPERTY('EngineEdition')) NOT IN (2,3,4)
  THROW 51202, 'Solo se admite motor SQL Server local, no Azure.', 1;
IF EXISTS (SELECT 1 FROM sys.tables WHERE is_ms_shipped = 0)
  THROW 51203, 'La base debe estar vacia.', 1;
EXEC sys.sp_addextendedproperty @name=N'HostFlowTestIsolation',
  @value=N'hostflow-security-disposable-v1';
