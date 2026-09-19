const AirbnbChannelService = require("./AirbnbChannelService");
const BookingChannelService = require("./BookingChannelService");

class ChannelService {
  obtenerAccionesDisponibles(reserva) {
    const canal =
      reserva.canal || "Manual";

    const estado =
      reserva.estado;

    // =========================================================
    // ESTADOS CERRADOS
    // =========================================================
    //
    // Cancelada y No show quedan en modo consulta.
    //
    // Finalizada también queda en modo consulta, pero si la
    // reserva provino de Airbnb o Booking conservamos la acción
    // ABRIR_EN_CANAL para poder volver a la reserva histórica
    // del proveedor cuando tengamos el deep-link disponible.
    // =========================================================

    if (
      estado === "Cancelada" ||
      estado === "No show"
    ) {
      return ["VER"];
    }

    if (estado === "Finalizada") {
      if (
        canal === "Airbnb" ||
        canal === "Booking"
      ) {
        return [
          "VER",
          "ABRIR_EN_CANAL",
        ];
      }

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
