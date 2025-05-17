import * as functions from "firebase-functions";
import * as admin from "firebase-admin";


type CallableRequest<T> = functions.https.CallableRequest<T>;


admin.initializeApp();

// 🧩 Acá definís el tipo de datos que vas a recibir
type CopiarPlantillaData = {
  plantillaId: string;
  slug: string;
};

// ✅ Acá usás ese tipo en la función
export const copiarPlantilla = functions.https.onCall(
  async (request: CallableRequest<CopiarPlantillaData>) => {
    const { plantillaId, slug } = request.data;

    if (!plantillaId || !slug) {
      throw new functions.https.HttpsError("invalid-argument", "Faltan datos");
    }

    return {
      success: true,
      mensaje: `Plantilla ${plantillaId} copiada con slug ${slug}`
    };
  }
);
