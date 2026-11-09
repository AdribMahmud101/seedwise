// STUB - STUDIO1 builds real data layer in parallel.
// If studiodata.js is already being authored or tested, this minimal fallback returns fixture data.
import fixture from "../../tests/fixtures/studio-data.json" with { type: "json" };

export function buildStudioData(input = {}) {
  // If an input provides overrides or if custom field without prepared data
  const data = JSON.parse(JSON.stringify(fixture));
  if (input.fieldId && input.fieldId !== "mithapukur") {
    data.field.id = input.fieldId;
    data.field.name = input.fieldId;
    data.field.nameBn = input.fieldId;
  }
  if (input.rotationId) {
    data.rotation.id = input.rotationId;
  }
  if (input.custom) {
    data.field.boundary = "custom";
    data.vegetation = [];
    data.moisture = [];
    data.ground = null;
    data.soil = null;
  }
  return data;
}
