const DAY = 86400000;
export function validDate(s) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(s || "") &&
    Number.isFinite(Date.parse(s + "T12:00:00Z")) &&
    new Date(s + "T12:00:00Z").toISOString().slice(0, 10) === s
  );
}
export function shiftDate(s, days) {
  return new Date(Date.parse(s + "T12:00:00Z") + days * DAY)
    .toISOString()
    .slice(0, 10);
}
export function dayGap(a, b) {
  return Math.round(
    (Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / DAY,
  );
}
export function defaultAssessment(date) {
  return {
    phase: "active",
    date,
    delay: 0,
    ground: "unknown",
    standing: "unknown",
    water: "unknown",
    exposure: "unknown",
    seedlings: "unknown",
    land: "unknown",
    nextDate: "",
    edge: "none",
    example: false,
  };
}
export function holdReasons(hazard, a) {
  if (a.phase !== "ready")
    return [
      a.phase === "prepare"
        ? "prepare"
        : a.phase === "active"
          ? "active"
          : "inspect",
    ];
  const out = [];
  if (a.ground !== "workable")
    out.push(
      a.ground === "dry" ? "dry" : a.ground === "wet" ? "wet" : "ground",
    );
  if (hazard !== "drought" && !["clear", "reviewed"].includes(a.exposure))
    out.push(hazard === "fire" ? "burn" : "contamination");
  if (a.standing !== "free")
    out.push(a.standing === "recovering" ? "protect" : "stand");
  if (!["limited", "dependable"].includes(a.water)) out.push("water");
  return out;
}
export function buildRecovery(hazard, a, crops) {
  if (
    !validDate(a.date) ||
    a.delay === "" ||
    a.delay == null ||
    !Number.isInteger(+a.delay) ||
    +a.delay < 0 ||
    +a.delay > 180 ||
    (a.nextDate && (!validDate(a.nextDate) || a.nextDate <= a.date))
  )
    return { reasons: ["dates"], options: [] };
  const ready = shiftDate(a.date, +a.delay);
  const reasons = holdReasons(hazard, a);
  if (reasons.length) return { ready, reasons, options: [] };
  const options = crops
    .filter((c) => !c.hazards || c.hazards.includes(hazard))
    .map((c) => {
      let year = +ready.slice(0, 4);
      if (ready > year + "-" + c.end) year++;
      const start = year + "-" + c.start,
        end = year + "-" + c.end;
      const first = ready > start ? ready : start;
      let last = end;
      if (a.nextDate && c.days)
        last = [end, shiftDate(a.nextDate, -c.days[1] - 1)].sort()[0];
      let status = first === ready ? "open" : "upcoming";
      if (dayGap(a.date, first) > 183) status = "later";
      if (c.land && a.land !== c.land) status = "land";
      if (c.stock && a.seedlings !== c.stock) status = "seedlings";
      if (a.nextDate && !c.days) status = "duration";
      if (a.nextDate && (first >= a.nextDate || first > last))
        status = "deadline";
      return {
        ...c,
        start,
        end,
        first,
        last,
        status,
        available: ["open", "upcoming"].includes(status),
        harvest: c.days ? c.days.map((d) => shiftDate(first, d)) : null,
      };
    });
  options.sort(
    (a, b) =>
      Number(b.available) - Number(a.available) ||
      a.first.localeCompare(b.first),
  );
  return { ready, reasons, options };
}
