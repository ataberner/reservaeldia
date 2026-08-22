import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGalleryDragPreviewRows,
  createGalleryDragHitGeometry,
  resolveGalleryDragDropIndex,
} from "./gallerySidebarDragGeometry.js";
import {
  getGallerySlots,
  moveGalleryPhotoToSlot,
} from "../domain/gallery/galleryMutations.js";

const initialRows = [
  { top: 100, height: 58 },
  { top: 164, height: 58 },
  { top: 228, height: 58 },
];

function buildSlotRows(gallery) {
  return getGallerySlots(gallery).map((slot) => ({
    rowKey: slot.cellId || `slot-${slot.sourceIndex}`,
    slot,
  }));
}

function mediaOrderFromRows(rows) {
  return rows.map((row) => row.slot.mediaUrl || null);
}

function assertEveryPreviewMatchesCommit(gallery) {
  const initialRows = buildSlotRows(gallery);

  initialRows.forEach((fromRow, fromIndex) => {
    if (!fromRow.slot.isPopulated) return;

    initialRows.forEach((_, toIndex) => {
      if (fromIndex === toIndex) return;

      const previewRows = buildGalleryDragPreviewRows(initialRows, fromIndex, toIndex);
      const useDisplayIndexes = gallery.galleryLayoutMode === "dynamic_media";
      const committed = moveGalleryPhotoToSlot(
        gallery,
        useDisplayIndexes ? { displayIndex: fromIndex } : { sourceIndex: fromIndex },
        useDisplayIndexes ? { displayIndex: toIndex } : { sourceIndex: toIndex }
      );

      assert.equal(committed.changed, true);
      assert.deepEqual(
        mediaOrderFromRows(buildSlotRows(committed.gallery)),
        mediaOrderFromRows(previewRows),
        `${gallery.id}: preview ${fromIndex}->${toIndex}`
      );
    });
  });
}

test("fixed Gallery drag preview matches committed insertion for occupied and empty targets", () => {
  const cases = [
    {
      cells: [
        { id: "slot-a", mediaUrl: "A" },
        { id: "slot-b", mediaUrl: "B" },
        { id: "slot-c", mediaUrl: "C" },
      ],
      expected: ["B", "C", "A"],
    },
    {
      cells: [
        { id: "slot-a", mediaUrl: "A" },
        { id: "slot-b", mediaUrl: "B" },
        { id: "slot-c", mediaUrl: null },
      ],
      expected: ["B", null, "A"],
    },
  ];

  cases.forEach(({ cells, expected }, index) => {
    const gallery = {
      id: `fixed-gallery-${index}`,
      tipo: "galeria",
      rows: 1,
      cols: 3,
      cells,
    };
    const previewRows = buildGalleryDragPreviewRows(buildSlotRows(gallery), 0, 2);

    assert.deepEqual(mediaOrderFromRows(previewRows), expected);
    assertEveryPreviewMatchesCommit(gallery);
  });
});

test("dynamic Gallery drag preview matches the committed ordered move", () => {
  const gallery = {
    id: "dynamic-gallery",
    tipo: "galeria",
    galleryLayoutMode: "dynamic_media",
    cells: [
      { id: "cell-a", mediaUrl: "A" },
      { id: "cell-b", mediaUrl: "B" },
      { id: "cell-c", mediaUrl: "C" },
    ],
  };

  const previewRows = buildGalleryDragPreviewRows(buildSlotRows(gallery), 0, 2);
  assert.deepEqual(mediaOrderFromRows(previewRows), ["B", "C", "A"]);
  assertEveryPreviewMatchesCommit(gallery);
});

test("Gallery drag hit testing stays stable while preview rows animate around a stationary pointer", () => {
  const geometry = createGalleryDragHitGeometry({
    listTop: 100,
    rowRects: initialRows,
  });

  const stationaryPointerY = 165;
  assert.equal(
    resolveGalleryDragDropIndex({
      clientY: stationaryPointerY,
      geometry,
      listTop: 100,
    }),
    1
  );

  // Preview/FLIP transforms can visually move rows in either direction. The drag
  // session keeps using the initial logical hit geometry, so those transient
  // rectangles cannot make the destination alternate between adjacent slots.
  const animatedPreviewFrames = [
    [
      { top: 164, height: 58 },
      { top: 100, height: 58 },
      { top: 228, height: 58 },
    ],
    [
      { top: 142, height: 58 },
      { top: 122, height: 58 },
      { top: 228, height: 58 },
    ],
    initialRows,
  ];

  const resolveFromLiveRects = (rowRects) => {
    const liveGeometry = createGalleryDragHitGeometry({
      listTop: 100,
      rowRects,
    });
    return resolveGalleryDragDropIndex({
      clientY: stationaryPointerY,
      geometry: liveGeometry,
      listTop: 100,
    });
  };

  assert.deepEqual(animatedPreviewFrames.map(resolveFromLiveRects), [0, 0, 1]);
  assert.deepEqual(
    animatedPreviewFrames.map(() =>
      resolveGalleryDragDropIndex({
        clientY: stationaryPointerY,
        geometry,
        listTop: 100,
      })
    ),
    [1, 1, 1]
  );
});

test("Gallery drag hit testing follows list scrolling without rebuilding row thresholds", () => {
  const geometry = createGalleryDragHitGeometry({
    listTop: 100,
    scrollTop: 20,
    rowRects: initialRows,
  });

  assert.equal(
    resolveGalleryDragDropIndex({
      clientY: 101,
      geometry,
      listTop: 100,
      scrollTop: 84,
    }),
    1
  );
});

test("Gallery drag hit testing rejects incomplete geometry", () => {
  assert.equal(createGalleryDragHitGeometry({ rowRects: [] }), null);
  assert.equal(resolveGalleryDragDropIndex({ clientY: 120, geometry: null }), -1);
});
