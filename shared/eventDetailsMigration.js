import runtime from "./eventDetailsMigration.cjs";

export const LEGACY_EVENT_FIELD_MIGRATIONS = runtime.LEGACY_EVENT_FIELD_MIGRATIONS;
export const migrateLegacyValueMap = runtime.migrateLegacyValueMap;
export const normalizeEventDetailsAuthoringContract =
  runtime.normalizeEventDetailsAuthoringContract;
export const normalizeEventDetailsDocumentContract =
  runtime.normalizeEventDetailsDocumentContract;

export default runtime;
