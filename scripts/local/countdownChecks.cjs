// Existing isolated regressions, classified by what they actually execute.
// One list owns both temporary source copying and the dedicated Rules command.
module.exports = {
  behavior: [
    "functions/countdownPresetPhase1Policy.test.mjs",
    "functions/countdownPresetPhase3Policy.test.mjs",
    "shared/countdownFrameAssetContract.test.mjs",
  ],
  static: [
    "functions/countdownPresetPhase1Service.test.mjs",
    "functions/countdownPresetPhase3Service.test.mjs",
  ],
  mixed: ["functions/countdownFrameAssetValidation.test.mjs"],
};
