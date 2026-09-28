const https = require(
  "https"
);


class IaService {
  constructor() {
    this.apiKey =
      process.env.GEMINI_API_KEY
        ?.trim() ||
      "";

    this.modelo =
      process.env.GEMINI_MODEL
        ?.trim() ||
      "gemini-3.5-flash-lite";

    this.timeoutMs =
      60000;
  }


  // =========================================================
  // ESTADO
  // =========================================================

  estaConfigurada() {
    return Boolean(
      this.apiKey
    );
  }


  obtenerEstado() {
    return {
      configurada:
        this.estaConfigurada(),

      proveedor:
        "Google Gemini",

      modelo:
        this.modelo,
    };
  }


  // =========================================================
  // HTTP
  // =========================================================

  solicitarGemini(
    payload
  ) {
    return new Promise(
      (
        resolve,
        reject
      ) => {
        const cuerpo =
          JSON.stringify(
            payload
          );

        const request =
          https.request(
            {
              hostname:
                "generativelanguage.googleapis.com",

              port:
                443,

              path:
                "/v1beta/interactions",

              method:
                "POST",

              headers: {
                "x-goog-api-key":
                  this.apiKey,

                "Content-Type":
                  "application/json",

                "Content-Length":
                  Buffer.byteLength(
                    cuerpo
                  ),
              },
            },
            (response) => {
              let datos =
                "";

              response.setEncoding(
                "utf8"
              );

              response.on(
                "data",
                (fragmento) => {
                  datos +=
                    fragmento;
                }
              );

              response.on(
                "end",
                () => {
                  let json;

                  try {
                    json =
                      datos
                        ? JSON.parse(
                            datos
                          )
                        : {};
                  } catch {
                    reject(
                      new Error(
                        "Gemini devolvió una respuesta que no pudo interpretarse."
                      )
                    );

                    return;
                  }

                  if (
                    response.statusCode <
                      200 ||
                    response.statusCode >=
                      300
                  ) {
                    const mensaje =
                      json.error
                        ?.message ||
                      `Gemini respondió con estado HTTP ${response.statusCode}.`;

                    reject(
                      new Error(
                        mensaje
                      )
                    );

                    return;
                  }

                  resolve(
                    json
                  );
                }
              );
            }
          );

        request.setTimeout(
          this.timeoutMs,
          () => {
            request.destroy(
              new Error(
                "La solicitud a Gemini excedió el tiempo máximo de espera."
              )
            );
          }
        );

        request.on(
          "error",
          (error) => {
            reject(
              error
            );
          }
        );

        request.write(
          cuerpo
        );

        request.end();
      }
    );
  }


  extraerTextoRespuesta(
    response
  ) {
    for (
      const paso
      of response
        ?.steps ||
      []
    ) {
      if (
        paso.type !==
          "model_output"
      ) {
        continue;
      }

      for (
        const contenido
        of paso.content ||
        []
      ) {
        if (
          contenido.type ===
            "text" &&
          typeof contenido.text ===
            "string" &&
          contenido.text.trim()
        ) {
          return contenido.text
            .trim();
        }
      }
    }

    return "";
  }


  // =========================================================
  // ENRIQUECER RECOMENDACIONES
  // =========================================================

  async enriquecerRecomendaciones({
    fechaNegocio,
    recomendaciones,
  }) {
    if (
      !this.estaConfigurada()
    ) {
      return {
        aplicada:
          false,

        modelo:
          this.modelo,

        motivo:
          "GEMINI_API_KEY no está configurada.",

        recomendaciones:
          [],
      };
    }

    if (
      !Array.isArray(
        recomendaciones
      ) ||
      recomendaciones.length ===
        0
    ) {
      return {
        aplicada:
          false,

        modelo:
          this.modelo,

        motivo:
          "No hay recomendaciones determinísticas para enriquecer.",

        recomendaciones:
          [],
      };
    }

    const contexto =
      recomendaciones.map(
        (item) => ({
          id:
            item.id,

          tipo:
            item.tipo,

          prioridad:
            item.prioridad,

          tituloBase:
            item.titulo,

          descripcionBase:
            item.descripcion,

          accionBase:
            item.accion,

          evidencia:
            item.evidencia,
        })
      );

    const schema = {
      type:
        "object",

      properties: {
        recomendaciones: {
          type:
            "array",

          items: {
            type:
              "object",

            properties: {
              id: {
                type:
                  "string",
              },

              titulo: {
                type:
                  "string",
              },

              descripcion: {
                type:
                  "string",
              },

              accion: {
                type:
                  "string",
              },

              fundamento: {
                type:
                  "string",
              },
            },

            required: [
              "id",
              "titulo",
              "descripcion",
              "accion",
              "fundamento",
            ],
          },
        },
      },

      required: [
        "recomendaciones",
      ],
    };

    const instrucciones = [
      "Sos la capa de asistencia inteligente de HostFlow, un sistema de gestión de alquileres temporarios.",
      "Recibís recomendaciones que YA fueron detectadas por reglas determinísticas de HostFlow.",
      "Tu tarea es mejorar solamente su redacción y explicar brevemente por qué requieren atención.",
      "No inventes hechos, porcentajes, fechas, huéspedes, causas, tendencias ni riesgos que no estén en la evidencia recibida.",
      "No cambies la prioridad.",
      "No agregues ni elimines recomendaciones.",
      "Conservá exactamente el mismo id de cada recomendación.",
      "No propongas modificar precios automáticamente ni ejecutar acciones irreversibles.",
      "Para ocupación baja, sugerí revisar disponibilidad, publicación y desempeño; no afirmes una causa que los datos no demuestren.",
      "Usá español claro y profesional, natural para Argentina.",
      "El título debe ser breve.",
      "La descripción debe explicar el hecho usando únicamente los datos disponibles.",
      "La acción debe ser concreta y prudente.",
      "El fundamento debe ser una frase breve indicando la evidencia principal que respalda la recomendación.",
    ].join(
      "\n"
    );

    const payload = {
      model:
        this.modelo,

      store:
        false,

      system_instruction:
        instrucciones,

      input:
        JSON.stringify({
          fechaNegocio,
          recomendaciones:
            contexto,
        }),

      response_format: {
        type:
          "text",

        mime_type:
          "application/json",

        schema,
      },

      generation_config: {
        temperature:
          0.2,

        thinking_level:
          "minimal",
      },
    };

    const response =
      await this
        .solicitarGemini(
          payload
        );

    if (
      response.status &&
      response.status !==
        "completed"
    ) {
      throw new Error(
        `Gemini no completó la solicitud. Estado: ${response.status}.`
      );
    }

    const texto =
      this.extraerTextoRespuesta(
        response
      );

    if (!texto) {
      throw new Error(
        "Gemini no devolvió contenido de texto."
      );
    }

    let salida;

    try {
      salida =
        JSON.parse(
          texto
        );
    } catch {
      throw new Error(
        "La respuesta estructurada de Gemini no pudo interpretarse como JSON."
      );
    }

    const items =
      Array.isArray(
        salida
          ?.recomendaciones
      )
        ? salida
            .recomendaciones
        : [];

    const idsPermitidos =
      new Set(
        recomendaciones.map(
          (item) =>
            item.id
        )
      );

    const recomendacionesValidas =
      items.filter(
        (item) =>
          item &&
          idsPermitidos.has(
            item.id
          )
      );

    return {
      aplicada:
        recomendacionesValidas
          .length >
        0,

      proveedor:
        "Google Gemini",

      modelo:
        response.model ||
        this.modelo,

      interactionId:
        response.id ||
        null,

      recomendaciones:
        recomendacionesValidas,

      uso: {
        inputTokens:
          Number(
            response.usage
              ?.total_input_tokens ||
            0
          ),

        outputTokens:
          Number(
            response.usage
              ?.total_output_tokens ||
            0
          ),

        totalTokens:
          Number(
            response.usage
              ?.total_tokens ||
            0
          ),
      },
    };
  }
}


module.exports =
  new IaService();