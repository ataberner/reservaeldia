import test from "node:test";
import assert from "node:assert/strict";
import { createMusicPreviewController } from "./previewController.js";

function fixture({ pending = false, rejected = false } = {}) {
  const audios = [], states = [];
  const controller = createMusicPreviewController({
    onChange: (state) => states.push(state),
    createAudio() {
      const audio = { paused: true, plays: 0, pauses: 0, loads: 0,
        play() { this.plays++; this.paused = false; return pending ? new Promise((resolve) => { this.finish = resolve; }) : rejected ? Promise.reject(new Error("blocked")) : Promise.resolve(); },
        pause() { this.paused = true; this.pauses++; },
        removeAttribute(name) { delete this[name]; },
        load() { this.loads++; },
      };
      audios.push(audio); return audio;
    },
  });
  return { controller, audios, states };
}
const track = (id) => ({ id, url: `http://local.test/${id}.mp3` });

test("sidebar allocates no audio until explicit listen; pause/resume retains one instance", async () => {
  const { controller, audios, states } = fixture();
  assert.equal(audios.length, 0);
  await controller.toggle(track("a"), 0.2);
  assert.equal(audios[0].volume, 0.2);
  assert.equal(audios[0].preload, "none");
  await controller.toggle(track("a"));
  assert.equal(audios[0].paused, true);
  assert.equal(states.at(-1).status, "paused");
  await controller.toggle(track("a"));
  assert.equal(audios.length, 1);
  assert.equal(audios[0].plays, 2);
  controller.dispose();
});

test("changing songs stops and unloads the previous preview before creating another", async () => {
  const { controller, audios, states } = fixture();
  await controller.toggle(track("a"));
  await controller.toggle(track("b"));
  assert.equal(audios[0].paused, true);
  assert.equal(audios[0].src, undefined);
  assert.equal(audios[0].loads, 1);
  assert.deepEqual(states.at(-1), { id: "b", status: "playing" });
  controller.dispose();
});

test("late play completion cannot revive a stopped or unmounted preview", async () => {
  const { controller, audios, states } = fixture({ pending: true });
  const playing = controller.toggle(track("a"));
  controller.stop();
  audios[0].finish();
  await playing;
  assert.equal(audios[0].paused, true);
  assert.deepEqual(states.at(-1), { id: null, status: "idle" });
  controller.dispose();
  await controller.toggle(track("b"));
  assert.equal(audios.length, 1);
});

test("rejected playback is recoverable and does not leave a playing state", async () => {
  const { controller, states } = fixture({ rejected: true });
  await controller.toggle(track("a"));
  assert.equal(states.at(-1).status, "error");
  controller.stop();
  assert.equal(states.at(-1).status, "idle");
});

test("a second click during a pending play pauses instead of creating a second play request", async () => {
  const { controller, audios, states } = fixture({ pending: true });
  const playing = controller.toggle(track("a"));
  await controller.toggle(track("a"));
  audios[0].finish();
  await playing;
  assert.equal(audios[0].plays, 1);
  assert.equal(audios[0].paused, true);
  assert.equal(states.at(-1).status, "paused");
});
