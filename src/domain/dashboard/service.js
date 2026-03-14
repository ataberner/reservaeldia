import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebase";

const getDashboardHomeConfigCallable = httpsCallable(
  functions,
  "getDashboardHomeConfigV1"
);
const upsertDashboardHomeConfigCallable = httpsCallable(
  functions,
  "adminUpsertDashboardHomeConfigV1"
);

function unwrap(result) {
  return result?.data || {};
}

export async function getDashboardHomeConfig() {
  const result = unwrap(await getDashboardHomeConfigCallable({}));
  return result?.config || null;
}

export async function upsertDashboardHomeConfig(config) {
  const result = unwrap(
    await upsertDashboardHomeConfigCallable({
      config: config && typeof config === "object" ? config : {},
    })
  );
  return result?.config || null;
}
