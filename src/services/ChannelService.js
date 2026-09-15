const AirbnbChannelService = require("./AirbnbChannelService");
const BookingChannelService = require("./BookingChannelService");

class ChannelService {
  obtenerAccionesDisponibles(reserva) {
    const canal =
      reserva.canal || "Manual";

    const estado =
      reserva.estado;

    // Una reserva cancelada, finalizada o no-show
    // ya no admite acciones operativas normales.
    if (
      estado === "Cancelada" ||
      estado === "Finalizada" ||
      estado === "No show"
    ) {
      return ["VER"];
    }

    switch (canal) {
      // =====================================================
      // MANUAL
      // =====================================================

      case "Manual":
        return [
          "VER",
          "EDITAR",
          "CANCELAR",
        ];

      // =====================================================
      // AIRBNB
      // =====================================================

      case "Airbnb": {
        const solicitudPendiente =
          AirbnbChannelService
            .obtenerSolicitudPendientePorReserva(
              reserva.idReserva
            );

        if (solicitudPendiente) {
          return [
            "VER",
            "VER_PROPUESTA_AIRBNB",
            "ABRIR_EN_CANAL",
          ];
        }

        return [
          "VER",
          "PROPONER_CAMBIO",
          "ABRIR_EN_CANAL",
        ];
      }

      // =====================================================
      // BOOKING
      // =====================================================

      case "Booking": {
        const operacionPendiente =
          BookingChannelService
            .obtenerOperacionPendientePorReserva(
              reserva.idReserva
            );

        if (operacionPendiente) {
          return [
            "VER",
            "VER_OPERACION_BOOKING",
            "ABRIR_EN_CANAL",
          ];
        }

        return [
          "VER",
          "GESTIONAR_BOOKING",
          "ABRIR_EN_CANAL",
        ];
      }

      // =====================================================
      // OTROS
      // =====================================================

      default:
        return ["VER"];
    }
  }

  obtenerTipoGestion(canal) {
    switch (canal) {
      case "Manual":
        return "INTERNA";

      case "Airbnb":
      case "Booking":
        return "EXTERNA";

      default:
        return "DESCONOCIDA";
    }
  }

  permiteEdicionDirecta(canal) {
    return canal === "Manual";
  }

  permiteCancelacionDirecta(canal) {
    return canal === "Manual";
  }
}

module.exports =
  new ChannelService();